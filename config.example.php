<?php
// Kopiera till config.php och fyll i dina lokala databasuppgifter.
return [
    'db_host' => '127.0.0.1',
    'db_port' => 3306,
    'db_name' => 'puls',
    'db_user' => 'puls_app',
    'db_password' => 'ange-ett-unikt-databaslosenord',
    // Tomt = använd aktuell adress. Ange HTTPS-adress vid publicering.
    // För QR från XAMPP till mobilen: använd datorns LAN-IP här, t.ex.
    // 'base_url' => 'http://192.168.1.42/puls/',
    // Produktion: 'base_url' => 'https://puls.j4rl.se/',
    'base_url' => '',
    'max_answers' => 5000,
    'max_questions_per_hour' => 30,
    'max_questions_per_ip_per_hour' => 120,
    'max_registrations_per_hour' => 5,
    'max_login_attempts_per_quarter_hour' => 30,
];
