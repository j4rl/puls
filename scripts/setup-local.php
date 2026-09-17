<?php
declare(strict_types=1);

// Endast lokal kommandorad. Inga installationsuppgifter tas emot via webben.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$root = dirname(__DIR__);
$configPath = $root.'/config.php';
try {
    $config = is_file($configPath) ? require $configPath : null;
    $standardRoot = $config !== null && ($config['db_user'] ?? '') === 'root' && ($config['db_password'] ?? '') === '';
    if ($config !== null && !$standardRoot && (($config['db_name'] ?? '') !== 'puls'
        || !in_array($config['db_host'] ?? '', ['localhost', '127.0.0.1'], true)
        || ($config['db_user'] ?? '') !== 'puls_app')) {
        throw new RuntimeException('En egen config.php finns. Behåll den och importera database.sql manuellt i den avsedda databasen.');
    }
    $port = (int)($config['db_port'] ?? getenv('PULS_DB_PORT') ?: 3306);
    $admin = new mysqli('127.0.0.1', getenv('PULS_DB_ADMIN_USER') ?: 'root', getenv('PULS_DB_ADMIN_PASSWORD') ?: '', '', $port);
    $admin->set_charset('utf8mb4');
    $existing = $admin->query("SELECT User FROM mysql.user WHERE User='puls_app' AND Host='localhost'")->num_rows > 0;
    if ($existing && $config === null) {
        throw new RuntimeException('Databasanvändaren puls_app finns redan. Återställ dess config.php innan installationen fortsätter. Inget lösenord har ändrats.');
    }
    $password = $config['db_password'] ?? bin2hex(random_bytes(24));
    $admin->query('CREATE DATABASE IF NOT EXISTS puls CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $admin->select_db('puls');
    $sql = file_get_contents($root.'/database.sql');
    if ($sql === false) throw new RuntimeException('Kan inte läsa database.sql.');
    $admin->multi_query($sql);
    do {
        if ($result = $admin->store_result()) $result->free();
        if (!$admin->more_results()) break;
    } while ($admin->next_result());
    if (!$existing && !$standardRoot) {
        $escaped = $admin->real_escape_string($password);
        $admin->query("CREATE USER 'puls_app'@'localhost' IDENTIFIED BY '$escaped'");
    }
    if (!$standardRoot) $admin->query("GRANT SELECT, INSERT, UPDATE, DELETE ON puls.* TO 'puls_app'@'localhost'");
    // Kontrollera anslutningen innan konfigurationen sparas.
    $app = new mysqli('127.0.0.1', $standardRoot ? 'root' : 'puls_app', $password, 'puls', $port);
    $app->set_charset('utf8mb4');
    if ($config === null) {
        $config = require $root.'/config.example.php';
        $config = array_replace($config, ['db_host'=>'127.0.0.1', 'db_port'=>$port, 'db_name'=>'puls', 'db_user'=>'puls_app', 'db_password'=>$password, 'base_url'=>'']);
        $handle = fopen($configPath, 'x');
        if ($handle === false) throw new RuntimeException('Kunde inte skapa config.php.');
        $contents = "<?php\n// Lokal konfiguration. Ska inte checkas in.\nreturn ".var_export($config, true).";\n";
        if (fwrite($handle, $contents) !== strlen($contents)) throw new RuntimeException('Kunde inte skriva hela config.php.');
        fclose($handle);
    }
    echo "Puls är installerat. Databas: puls. Databasanvändare: ".($standardRoot?'root':'puls_app').".\n";
    echo "Öppna http://localhost/puls/ när Apache är igång i XAMPP.\n";
    echo "Befintliga databastabeller har behållits; appen använder nu tabeller med prefixet puls_.\n";
} catch (Throwable $e) {
    fwrite(STDERR, "Installationen avbröts: ".$e->getMessage()."\n");
    exit(1);
}
