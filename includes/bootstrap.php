<?php
declare(strict_types=1);
ini_set('display_errors','0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
function respond(array $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data,JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
set_exception_handler(static function(Throwable $e): void {
    error_log('Puls: '.get_class($e).': '.$e->getMessage());
    respond(['error'=>'Tjänsten kunde inte behandla förfrågan. Kontrollera installationen eller försök igen.'],503);
});
if (!is_file(dirname(__DIR__).'/config.php')) respond(['error'=>'Puls är inte installerat ännu. Kopiera config.example.php till config.php, fyll i databasen och importera database.sql.'],503);
$config = require dirname(__DIR__).'/config.php';
if (!is_array($config)) throw new RuntimeException('config.php måste returnera en inställningslista.');
require __DIR__.'/validation.php';
$baseUrl = (string)($config['base_url'] ?? '');
if ($baseUrl !== '' && (!filter_var($baseUrl,FILTER_VALIDATE_URL) || !in_array(parse_url($baseUrl,PHP_URL_SCHEME),['http','https'],true) || parse_url($baseUrl,PHP_URL_QUERY) !== null || parse_url($baseUrl,PHP_URL_FRAGMENT) !== null || parse_url($baseUrl,PHP_URL_USER) !== null || parse_url($baseUrl,PHP_URL_PASS) !== null)) {
    throw new RuntimeException('base_url måste vara en fullständig HTTP- eller HTTPS-adress.');
}
if ($baseUrl !== '') $baseUrl = rtrim($baseUrl, '/').'/';
$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || strpos($baseUrl,'https://') === 0;
$cookiePath = str_replace('\\','/',dirname($_SERVER['SCRIPT_NAME'] ?? '/api.php'));
$cookiePath = $cookiePath === '/' ? '/' : rtrim($cookiePath,'/').'/';
ini_set('session.use_strict_mode','1');
ini_set('session.use_only_cookies','1');
ini_set('session.use_trans_sid','0');
ini_set('session.gc_maxlifetime','43200');
session_name('puls_session');
session_set_cookie_params(['lifetime'=>0,'path'=>$cookiePath,'secure'=>$secure,'httponly'=>true,'samesite'=>'Lax']);
session_start();
if (isset($_SESSION['user_id']) && (time() - (int)($_SESSION['last_seen'] ?? 0) > 43200 || time() - (int)($_SESSION['authenticated_at'] ?? 0) > 604800)) {
    $_SESSION = [];
    session_regenerate_id(true);
}
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
if (isset($_SESSION['user_id']) && time() - (int)($_SESSION['last_seen'] ?? 0) > 300) $_SESSION['last_seen'] = time();
$csrf = $_SESSION['csrf'];
session_write_close(); // Undvik låsning mellan resultatpollning och andra anrop.
function persistent_token(string $name): string {
    global $cookiePath,$secure;
    $token = $_COOKIE[$name] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D',$token)) {
        $token = bin2hex(random_bytes(32));
        setcookie($name,$token,['expires'=>time()+31536000,'path'=>$cookiePath,'secure'=>$secure,'httponly'=>true,'samesite'=>'Lax']);
        $_COOKIE[$name]=$token;
    }
    return $token;
}
function guest_owner_hash(): string { return hash('sha256',persistent_token('puls_owner')); }
function owner_hash(): string {
    $user = current_user();
    return $user ? $user['owner_hash'] : guest_owner_hash();
}
function voter_hash(): string { return hash('sha256',persistent_token('puls_voter')); }
function database(): mysqli {
    global $config;
    static $connection = null;
    if ($connection instanceof mysqli) return $connection;
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $connection = new mysqli($config['db_host'], $config['db_user'], $config['db_password'], $config['db_name'], (int)($config['db_port'] ?? 3306));
    $connection->set_charset('utf8mb4');
    return $connection;
}
function query(string $sql, string $types = '', array $parameters = []): mysqli_stmt {
    $stmt = database()->prepare($sql);
    if ($types !== '') $stmt->bind_param($types,...$parameters);
    $stmt->execute();
    return $stmt;
}
function require_write(int $maxBytes = 16384): array {
    global $csrf;
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') respond(['error'=>'Använd POST för denna åtgärd.'],405);
    if (!hash_equals($csrf,(string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) respond(['error'=>'Sessionen har gått ut. Ladda om sidan och försök igen.'],403);
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') respond(['error'=>'JSON krävs.'],415);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0)>$maxBytes) respond(['error'=>'För mycket text.'],413);
    $raw = file_get_contents('php://input',false,null,0,$maxBytes+1);
    if ($raw === false || strlen($raw)>$maxBytes) respond(['error'=>'För mycket text.'],413);
    try { $data=json_decode($raw,true,32,JSON_THROW_ON_ERROR); } catch(JsonException $e) { respond(['error'=>'Ogiltiga data.'],400); }
    if (!is_array($data) || substr(ltrim($raw),0,1) !== '{') respond(['error'=>'JSON-data måste vara ett objekt.'],400);
    return $data;
}
function find_question(string $code, bool $lock = false): array {
    if (!preg_match('/^[0-9]{6}$/D',$code)) respond(['error'=>'Ange en sexsiffrig kod.'],400);
    $row = query('SELECT * FROM questions WHERE code=?'.($lock?' FOR UPDATE':''),'s',[$code])->get_result()->fetch_assoc();
    if (!$row) respond(['error'=>'Ingen fråga hittades med den koden.'],404);
    return $row;
}
function require_owner(array $q): void {
    if (!hash_equals($q['owner_hash'],owner_hash())) respond(['error'=>'Logga in på kontot som äger frågan eller öppna resultatet i den webbläsare där du skapade frågan som gäst.'],403);
}
function public_question(array $q): array {
    return ['code'=>$q['code'],'title'=>$q['title'],'kind'=>$q['kind'],'options'=>json_decode($q['options_json'],true),'min'=>(float)$q['min_value'],'max'=>(float)$q['max_value'],'view'=>$q['result_view'],'open'=>(bool)$q['is_open'],'created'=>$q['created_at']];
}
require __DIR__.'/accounts.php';
