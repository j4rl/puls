<?php
declare(strict_types=1);

// Kör bara mot den lokala installationen. Skapade testfrågor/konton tas bort i finally.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$base = rtrim($argv[1] ?? 'http://localhost/puls', '/');
if (!in_array(parse_url($base, PHP_URL_HOST), ['localhost', '127.0.0.1'], true)) {
    fwrite(STDERR, "Integrationstestet får bara köras mot localhost.\n"); exit(1);
}
$config = require dirname(__DIR__).'/config.php';
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$db = new mysqli($config['db_host'], $config['db_user'], $config['db_password'], $config['db_name'], (int)$config['db_port']);
$db->set_charset('utf8mb4');
$prefix = 'puls-test-'.bin2hex(random_bytes(8));
$email = $prefix.'@example.test';
$password = bin2hex(random_bytes(18));
$created = [];
$clients = [];
$testIp = '127.0.0.'.random_int(2, 254);
$rateIp = '127.0.1.'.random_int(2, 254);
$rateEmail = $prefix.'-limit@example.test';
$rateKeys = [];
foreach ([['create-ip',$testIp],['register-ip',$testIp],['login-ip',$testIp],['login-email',$email],['login-ip',$rateIp],['login-email',$rateEmail]] as [$scope,$identity]) {
    $key = hash('sha256', $scope."\0".$identity);
    $stmt = $db->prepare('SELECT rate_key FROM auth_rate_limits WHERE rate_key=?');
    $stmt->bind_param('s', $key); $stmt->execute();
    if ($stmt->get_result()->num_rows === 0) $rateKeys[] = $key;
}

function client(?string $sourceIp = null): array {
    global $clients, $testIp;
    $curl = curl_init();
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_COOKIEFILE=>'', CURLOPT_TIMEOUT=>15, CURLOPT_INTERFACE=>$sourceIp ?? $testIp, CURLOPT_IPRESOLVE=>CURL_IPRESOLVE_V4]);
    $clients[] = $curl;
    return ['curl'=>$curl, 'csrf'=>''];
}
function copyGuestCookie(array $source): array {
    $copy = client();
    $found = false;
    foreach (curl_getinfo($source['curl'], CURLINFO_COOKIELIST) as $cookie) {
        if ((explode("\t", $cookie)[5] ?? '') === 'puls_owner') {
            curl_setopt($copy['curl'], CURLOPT_COOKIELIST, $cookie);
            $found = true;
        }
    }
    if (!$found) throw new RuntimeException('Guest owner cookie was not issued.');
    request($copy, 'bootstrap');
    return $copy;
}
function request(array &$client, string $action, ?array $data = null, array $query = [], int $expected = 200, ?string $csrf = null): array {
    global $base;
    $curl = $client['curl'];
    curl_setopt($curl, CURLOPT_URL, $base.'/api.php?'.http_build_query(['action'=>$action]+$query));
    curl_setopt($curl, CURLOPT_POST, $data !== null);
    curl_setopt($curl, CURLOPT_HTTPHEADER, $data === null ? [] : ['Content-Type: application/json', 'X-CSRF-Token: '.($csrf ?? $client['csrf'])]);
    $headers = [];
    curl_setopt($curl, CURLOPT_HEADERFUNCTION, static function($curl, string $line) use (&$headers): int {
        if (strpos($line, ':') !== false) {
            [$name,$value] = explode(':', $line, 2);
            $headers[strtolower(trim($name))] = trim($value);
        }
        return strlen($line);
    });
    if ($data !== null) curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode((object)$data, JSON_THROW_ON_ERROR));
    $raw = curl_exec($curl);
    if ($raw === false) throw new RuntimeException(curl_error($curl));
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $body = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    if ($status !== $expected) throw new RuntimeException("$action gav $status, väntat $expected: ".$raw);
    $client['headers'] = $headers;
    if (isset($body['csrf'])) $client['csrf'] = $body['csrf'];
    return $body;
}
function check(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException('FAIL: '.$message);
    echo 'OK: '.$message."\n";
}
function createQuestion(array &$client, string $kind, array $extra = []): string {
    global $prefix, $created;
    $views = ['choice'=>'bars','yesno'=>'pie','check'=>'bars','word'=>'cloud','sentence'=>'cards','number'=>'thermo'];
    $data = array_replace(['title'=>$prefix.' '.$kind, 'kind'=>$kind, 'options'=>['Öva','Prata'], 'view'=>$views[$kind], 'min'=>-2.5, 'max'=>2.5], $extra);
    $code = request($client, 'create', $data, [], 201)['code'];
    $created[] = $code;
    return $code;
}

try {
    $owner = client(); $voter = client(); $other = client();
    request($owner, 'bootstrap'); request($voter, 'bootstrap'); request($other, 'bootstrap');
    check(strlen($owner['csrf']) === 64, 'Bootstrap creates a CSRF token');
    request($owner, 'create', [], [], 403, 'invalid');
    request($other, 'preferences', ['theme'=>null], [], 401);
    $answers = ['choice'=>'Öva','yesno'=>'Ja','check'=>['Öva','Prata'],'word'=>'nyfiken','sentence'=>'<script>alert(1)</script>','number'=>0];
    foreach ($answers as $kind=>$value) {
        $code = createQuestion($owner, $kind);
        $q = request($voter, 'question', null, ['code'=>$code]);
        check(!$q['answered'] && $q['question']['kind'] === $kind, "$kind opens for participants");
        request($other, 'results', null, ['code'=>$code], 403);
        request($other, 'update', ['open'=>false], ['code'=>$code], 403);
        request($voter, 'answer', ['value'=>$value], ['code'=>$code], 201);
        check(request($voter, 'answer', ['value'=>$value], ['code'=>$code])['already'] === true, "$kind cannot be submitted twice");
        $result = request($owner, 'results', null, ['code'=>$code]);
        check(count($result['answers']) === 1 && $result['answers'][0]['value'] === $value, "$kind result preserved");
        check(request($owner, 'results', null, ['code'=>$code, 'since'=>$result['answers'][0]['id']])['answers'] === [], "$kind incremental polling does not repeat answers");
    }
    $code = end($created);
    request($owner, 'update', ['open'=>false], ['code'=>$code]);
    request($other, 'answer', ['value'=>0], ['code'=>$code], 409);
    request($owner, 'update', ['open'=>true], ['code'=>$code]);
    request($other, 'answer', ['value'=>3], ['code'=>$code], 400);
    request($other, 'answer', ['value'=>-2.5], ['code'=>$code], 201);
    check(true, 'Pause, resume and numeric bounds work');
    $oldGuest = copyGuestCookie($owner);
    request($oldGuest, 'results', null, ['code'=>$code]);
    $csrfBeforeLogin = $owner['csrf'];
    $registered = request($owner, 'register', ['name'=>'Integrationstest', 'email'=>$email, 'password'=>$password], [], 201);
    check($registered['user']['email'] === $email && $csrfBeforeLogin !== $owner['csrf'], 'Registration signs in and rotates CSRF');
    check(!isset($registered['user']['password_hash']) && !isset($registered['user']['owner_hash']), 'Account responses omit credentials and ownership secrets');
    $stmt = $db->prepare('SELECT password_hash FROM users WHERE email=?');
    $stmt->bind_param('s', $email); $stmt->execute();
    $hash = $stmt->get_result()->fetch_assoc()['password_hash'];
    check($hash !== $password && password_verify($password, $hash), 'Account password is stored as a verified one-way hash');
    request($owner, 'preferences', ['theme'=>null], [], 403, $csrfBeforeLogin);
    request($oldGuest, 'results', null, ['code'=>$code], 403);
    check(request($oldGuest, 'list')['questions'] === [], 'Replayed pre-registration guest cookie cannot access claimed questions');
    check(count(request($owner, 'list')['questions']) === count($created), 'Registration claims this guest’s questions');
    request($other, 'login', ['email'=>$email, 'password'=>$password]);
    request($other, 'results', null, ['code'=>$code]);
    check(true, 'Account owner can access results in another browser');
    $theme = ['name'=>'Testtema', 'light'=>['bg'=>'#ffffff','surface'=>'#ffffff','text'=>'#111111','primary'=>'#4941ce','primary-contrast'=>'#ffffff'], 'dark'=>['bg'=>'#111111','surface'=>'#222222','text'=>'#eeeeee','primary'=>'#a49bff','primary-contrast'=>'#111111']];
    request($owner, 'preferences', ['theme'=>$theme]);
    check(request($other, 'bootstrap')['user']['theme']['name'] === 'Testtema', 'Theme persists on the account across browsers');
    request($owner, 'preferences', ['theme'=>['name'=>'Bad', 'light'=>['--bg'=>'url(https://example.test/a)'], 'dark'=>[]]], [], 400);
    request($owner, 'preferences', ['theme'=>null]);
    check(request($other, 'bootstrap')['user']['theme'] === null, 'Theme can be reset');
    request($owner, 'logout', []);
    check(request($owner, 'bootstrap')['user'] === null, 'Logout clears current user');
    request($owner, 'results', null, ['code'=>$code], 403);
    check(request($owner, 'list')['questions'] === [], 'Guest cookies do not expose account questions after logout');
    request($owner, 'login', ['email'=>$email, 'password'=>'incorrect-password'], [], 401);
    request($owner, 'login', ['email'=>$email, 'password'=>$password]);
    request($owner, 'results', null, ['code'=>$code]);
    request($owner, 'question', null, ['code'=>'bad'], 400);
    request($owner, 'results', null, ['code'=>$code, 'since'=>-1], 400);
    check(true, 'Re-login and invalid request handling work');
    $claimant = client();
    request($claimant, 'bootstrap');
    $guestCode = createQuestion($claimant, 'choice');
    $beforeClaim = copyGuestCookie($claimant);
    request($claimant, 'login', ['email'=>$email, 'password'=>$password]);
    check(!in_array($guestCode, array_column(request($claimant, 'list')['questions'], 'code'), true), 'Login preserves guest questions separately unless claiming is selected');
    request($claimant, 'results', null, ['code'=>$guestCode], 403);
    request($claimant, 'logout', []);
    request($claimant, 'results', null, ['code'=>$guestCode]);
    check(true, 'Unclaimed guest questions remain accessible after logout');
    request($claimant, 'login', ['email'=>$email, 'password'=>$password, 'claimGuest'=>true]);
    request($claimant, 'results', null, ['code'=>$guestCode]);
    request($owner, 'results', null, ['code'=>$guestCode]);
    request($beforeClaim, 'results', null, ['code'=>$guestCode], 403);
    request($claimant, 'logout', []);
    request($claimant, 'results', null, ['code'=>$guestCode], 403);
    check(true, 'Explicit guest claim transfers ownership and revokes both old and logged-out guest access');
    $limited = client($rateIp);
    request($limited, 'bootstrap');
    $attemptLimit = min(15, max(1, (int)($config['max_login_attempts_per_quarter_hour'] ?? 30)));
    for ($attempt = 0; $attempt < $attemptLimit; $attempt++) request($limited, 'login', ['email'=>$rateEmail, 'password'=>$password], [], 401);
    request($limited, 'login', ['email'=>$rateEmail, 'password'=>$password], [], 429);
    check((int)($limited['headers']['retry-after'] ?? 0) > 0, 'Login rate limit rejects excess attempts and sends Retry-After');
    foreach (['config.php','.git/config','database.sql','includes/bootstrap.php','scripts/setup-local.php','tests/integration.php','deploy/puls.j4rl.se.conf.example'] as $path) {
        $curl = curl_init($base.'/'.$path);
        curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>10]);
        curl_exec($curl);
        $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        curl_close($curl);
        check($status === 403 || $status === 404, 'Web access blocked: '.$path);
    }
    echo "All HTTP integration checks passed.\n";
} finally {
    foreach ($created as $code) {
        $stmt = $db->prepare('DELETE FROM questions WHERE code=? AND title LIKE ?');
        $title = $prefix.'%';
        $stmt->bind_param('ss', $code, $title); $stmt->execute();
    }
    $stmt = $db->prepare('DELETE FROM users WHERE email=?');
    $stmt->bind_param('s', $email); $stmt->execute();
    foreach ($rateKeys as $key) {
        $stmt = $db->prepare('DELETE FROM auth_rate_limits WHERE rate_key=?');
        $stmt->bind_param('s', $key); $stmt->execute();
    }
    foreach ($clients as $curl) curl_close($curl);
}
