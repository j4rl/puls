<?php
declare(strict_types=1);

function current_user(): ?array {
    if (empty($_SESSION['user_id'])) return null;
    static $cachedId = null, $cachedUser = null;
    $id = (int)$_SESSION['user_id'];
    if ($cachedId !== $id) {
        $cachedUser = query('SELECT id,name,email,password_hash,owner_hash,theme_json FROM users WHERE id=?','i',[$id])->get_result()->fetch_assoc() ?: null;
        $cachedId = $id;
    }
    return $cachedUser;
}

function public_user(?array $user): ?array {
    if (!$user) return null;
    return ['id'=>(int)$user['id'],'name'=>$user['name'],'email'=>$user['email'],'theme'=>$user['theme_json'] === null ? null : json_decode($user['theme_json'],true,32,JSON_THROW_ON_ERROR)];
}

function require_user(): array {
    $user = current_user();
    if (!$user) respond(['error'=>'Logga in för att spara ett eget tema.'],401);
    return $user;
}

function auth_response(?array $user, int $status = 200): void {
    global $csrf;
    respond(['csrf'=>$csrf,'user'=>public_user($user)],$status);
}

function authenticate_user(?array $user): void {
    global $csrf;
    session_start();
    $_SESSION = ['csrf'=>bin2hex(random_bytes(32))];
    if ($user) {
        $_SESSION['user_id'] = (int)$user['id'];
        $_SESSION['authenticated_at'] = time();
        $_SESSION['last_seen'] = time();
    }
    session_regenerate_id(true);
    $csrf = $_SESSION['csrf'];
    session_write_close();
}

function renew_guest_owner(): void {
    // Ett gammalt gäst-ID ska aldrig kunna återfå kontoägda frågor.
    unset($_COOKIE['puls_owner']);
    persistent_token('puls_owner');
}

function rate_limit(string $scope, string $identity, int $limit, int $seconds): void {
    $key = hash('sha256', $scope."\0".$identity);
    query('INSERT INTO auth_rate_limits (rate_key,attempts,reset_at) VALUES (?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND)) ON DUPLICATE KEY UPDATE attempts=IF(reset_at<=UTC_TIMESTAMP(),1,attempts+1),reset_at=IF(reset_at<=UTC_TIMESTAMP(),VALUES(reset_at),reset_at)','si',[$key,$seconds]);
    $row = query('SELECT attempts,GREATEST(1,TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),reset_at)) AS retry_after FROM auth_rate_limits WHERE rate_key=?','s',[$key])->get_result()->fetch_assoc();
    if ((int)$row['attempts'] > $limit) {
        header('Retry-After: '.(int)$row['retry_after']);
        respond(['error'=>'För många försök. Vänta en stund och försök igen.'],429);
    }
    if (random_int(1,100) === 1) query('DELETE FROM auth_rate_limits WHERE reset_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)');
}

function request_ip(): string {
    // Använd inte Forwarded/X-Forwarded-For utan en uttryckligen betrodd proxy.
    return (string)($_SERVER['REMOTE_ADDR'] ?? 'local');
}

function register_user(array $data): void {
    global $config;
    if (current_user()) respond(['error'=>'Du är redan inloggad.'],409);
    rate_limit('register-ip',request_ip(),max(1,(int)($config['max_registrations_per_hour'] ?? 5)),3600);
    $p = validate_registration($data);
    $passwordHash = password_hash($p['password'], PASSWORD_BCRYPT, ['cost'=>12]);
    $accountOwner = bin2hex(random_bytes(32));
    $guestOwner = guest_owner_hash();
    $db = database();
    $db->begin_transaction();
    try {
        query('INSERT INTO users (name,email,password_hash,owner_hash) VALUES (?,?,?,?)','ssss',[$p['name'],$p['email'],$passwordHash,$accountOwner]);
        $id = (int)$db->insert_id;
        query('UPDATE questions SET owner_hash=? WHERE owner_hash=?','ss',[$accountOwner,$guestOwner]);
        $db->commit();
    } catch (mysqli_sql_exception $e) {
        $db->rollback();
        if ($e->getCode() === 1062) respond(['error'=>'E-postadressen används redan. Logga in i stället.'],409);
        throw $e;
    } catch (Throwable $e) {
        $db->rollback();
        throw $e;
    }
    $user = ['id'=>$id,'name'=>$p['name'],'email'=>$p['email'],'owner_hash'=>$accountOwner,'theme_json'=>null];
    renew_guest_owner();
    authenticate_user($user);
    auth_response($user,201);
}

function login_user(array $data): void {
    global $config;
    if (current_user()) respond(['error'=>'Du är redan inloggad.'],409);
    rate_limit('login-ip',request_ip(),max(1,(int)($config['max_login_attempts_per_quarter_hour'] ?? 30)),900);
    $email = validate_email($data['email'] ?? null);
    $password = validate_password($data['password'] ?? null,false);
    if (isset($data['claimGuest']) && !is_bool($data['claimGuest'])) throw new InvalidArgumentException('Ogiltigt val för gästfrågor.');
    rate_limit('login-email',$email,15,900);
    $user = query('SELECT id,name,email,password_hash,owner_hash,theme_json FROM users WHERE email=?','s',[$email])->get_result()->fetch_assoc();
    // Samma bcrypt-kostnad även när e-postadressen saknas.
    $hash = $user ? $user['password_hash'] : '$2y$12$7QJYnSkSbBf6fyH42sVrK.npS3EiU.EJGexFYZPmNzh29U09xALUi';
    if (!password_verify($password,$hash) || !$user) respond(['error'=>'Fel e-postadress eller lösenord.'],401);
    if (password_needs_rehash($user['password_hash'],PASSWORD_BCRYPT,['cost'=>12])) query('UPDATE users SET password_hash=? WHERE id=?','si',[password_hash($password,PASSWORD_BCRYPT,['cost'=>12]),(int)$user['id']]);
    if (($data['claimGuest'] ?? false) === true) {
        query('UPDATE questions SET owner_hash=? WHERE owner_hash=?','ss',[$user['owner_hash'],guest_owner_hash()]);
        renew_guest_owner();
    }
    authenticate_user($user);
    auth_response($user);
}
