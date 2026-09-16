<?php
declare(strict_types=1);
function allowed_views(): array {
    return ['choice'=>['bars','pie'], 'yesno'=>['pie','bars'], 'number'=>['thermo','bars'], 'check'=>['bars'], 'sentence'=>['cards'], 'word'=>['cloud','cards']];
}
function valid_text($value, int $max): bool {
    return is_string($value) && mb_check_encoding($value, 'UTF-8') && trim($value) !== '' && mb_strlen(trim($value), 'UTF-8') <= $max && !str_contains($value, "\0");
}
function validate_email($value): string {
    if (!is_string($value)) throw new InvalidArgumentException('Ange en giltig e-postadress.');
    $email = strtolower(trim($value));
    if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Ange en giltig e-postadress.');
    return $email;
}
function validate_password($value, bool $registration = true): string {
    if (!is_string($value) || !mb_check_encoding($value, 'UTF-8') || str_contains($value, "\0") || strlen($value) > 72 || ($registration ? mb_strlen($value, 'UTF-8') < 10 : $value === '')) {
        throw new InvalidArgumentException($registration ? 'Lösenordet behöver minst 10 tecken och får vara högst 72 byte (svenska tecken tar mer än en byte).' : 'Ange ett giltigt lösenord.');
    }
    return $value;
}
function validate_registration(array $data): array {
    if (!valid_text($data['name'] ?? null, 80)) throw new InvalidArgumentException('Ange ett namn med högst 80 tecken.');
    return ['name'=>trim($data['name']), 'email'=>validate_email($data['email'] ?? null), 'password'=>validate_password($data['password'] ?? null)];
}
function validate_theme($theme): ?array {
    if ($theme === null) return null;
    if (!is_array($theme) || array_diff(array_keys($theme), ['name','light','dark']) || !valid_text($theme['name'] ?? null, 80)) throw new InvalidArgumentException('Temat behöver ett namn och färger för ljust och mörkt läge.');
    $colors = ['bg','surface','surface-muted','text','muted','border','primary','primary-hover','primary-contrast','accent','accent-contrast','secondary','tertiary','success','warning','danger'];
    $required = ['bg','surface','text','primary','primary-contrast'];
    $radii = ['radius-sm','radius-md','radius-lg'];
    $fonts = ['font-body','font-heading'];
    $result = ['name'=>trim($theme['name'])];
    foreach (['light','dark'] as $mode) {
        $tokens = $theme[$mode] ?? null;
        if (!is_array($tokens) || array_diff($required, array_keys($tokens))) throw new InvalidArgumentException('Temat saknar nödvändiga färger för ljust eller mörkt läge.');
        $result[$mode] = [];
        foreach ($tokens as $key=>$value) {
            if (!is_string($value)) throw new InvalidArgumentException('Temat innehåller ett ogiltigt värde.');
            if (in_array($key, $colors, true) && preg_match('/^#[0-9a-f]{6}$/iD', $value)) $result[$mode][$key] = strtolower($value);
            elseif (in_array($key, $radii, true) && preg_match('/^[0-9]{1,2}(?:\.[0-9]{1,2})?px$/D', $value) && (float)$value <= 64) $result[$mode][$key] = $value;
            elseif (in_array($key, $fonts, true) && mb_strlen($value, 'UTF-8') <= 200 && preg_match('/^[\p{L}\p{N} ,\'"-]+$/uD', $value) && trim($value) !== '') $result[$mode][$key] = trim($value);
            else throw new InvalidArgumentException('Temat innehåller en färg eller inställning som inte stöds.');
        }
    }
    if (strlen(json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)) > 8192) throw new InvalidArgumentException('Temat är för stort.');
    return $result;
}
function validate_question(array $data): array {
    $kind = $data['kind'] ?? '';
    if (!is_string($kind) || !isset(allowed_views()[$kind]) || !valid_text($data['title'] ?? null, 240)) {
        throw new InvalidArgumentException('Skriv en fråga (högst 240 tecken) och välj en frågetyp.');
    }
    $options = $kind === 'yesno' ? ['Ja','Nej'] : (in_array($kind, ['choice','check'], true) ? ($data['options'] ?? []) : []);
    if (!is_array($options) || count($options) > 10 || (in_array($kind, ['choice','check'], true) && count($options) < 2)) {
        throw new InvalidArgumentException('Ange mellan 2 och 10 svarsalternativ.');
    }
    foreach ($options as $option) {
        if (!valid_text($option, 100)) throw new InvalidArgumentException('Varje alternativ behöver 1–100 tecken.');
    }
    $options = array_values(array_map('trim', $options));
    if (count(array_unique(array_map(static function($s){ return mb_strtolower($s,'UTF-8'); }, $options))) !== count($options)) {
        throw new InvalidArgumentException('Svarsalternativen måste vara unika.');
    }
    $min = $kind === 'number' ? ($data['min'] ?? null) : 0;
    $max = $kind === 'number' ? ($data['max'] ?? null) : 10;
    if (!is_numeric($min) || !is_numeric($max) || !is_finite((float)$min) || !is_finite((float)$max) || $min >= $max || abs((float)$min)>1000000 || abs((float)$max)>1000000) {
        throw new InvalidArgumentException('Ange ett intervall där max är större än min, inom ±1 000 000.');
    }
    $view = $data['view'] ?? '';
    if (!is_string($view) || !in_array($view, allowed_views()[$kind], true)) throw new InvalidArgumentException('Välj en resultatvy som passar frågan.');
    return ['title'=>trim($data['title']), 'kind'=>$kind, 'options'=>$options, 'min'=>(float)$min, 'max'=>(float)$max, 'view'=>$view];
}
function validate_question_set(array $data): array {
    if (!valid_text($data['title'] ?? null,240)) throw new InvalidArgumentException('Ge frågesetet ett namn, högst 240 tecken.');
    if (!in_array($data['progression'] ?? null,['automatic','host'],true)) throw new InvalidArgumentException('Välj hur deltagarna går vidare mellan frågorna.');
    $questions=$data['questions'] ?? null;
    if (!is_array($questions) || count($questions)<1 || count($questions)>20 || array_keys($questions)!==range(0,count($questions)-1)) throw new InvalidArgumentException('Ett frågeset behöver 1–20 frågor.');
    foreach ($questions as $i=>$question) {
        if (!is_array($question)) throw new InvalidArgumentException('Ogiltig fråga i frågesetet.');
        try {$questions[$i]=validate_question($question);}
        catch (InvalidArgumentException $e) {throw new InvalidArgumentException('Fråga '.($i+1).': '.$e->getMessage());}
    }
    return ['title'=>trim($data['title']),'progression'=>$data['progression'],'questions'=>$questions];
}
function validate_answer(array $question, $value) {
    $kind = $question['kind'];
    if ($kind === 'number') {
        if ((!is_int($value) && !is_float($value)) || !is_finite((float)$value) || $value < (float)$question['min_value'] || $value > (float)$question['max_value']) {
            throw new InvalidArgumentException('Ange ett tal inom frågans intervall.');
        }
        return $value;
    }
    $options = json_decode($question['options_json'], true, 512, JSON_THROW_ON_ERROR);
    if ($kind === 'check') {
        if (!is_array($value) || !count($value) || count($value)>count($options)) throw new InvalidArgumentException('Välj minst ett alternativ.');
        foreach ($value as $item) if (!is_string($item) || !in_array($item,$options,true)) throw new InvalidArgumentException('Ogiltigt svarsalternativ.');
        if (count(array_unique($value)) !== count($value)) throw new InvalidArgumentException('Samma alternativ kan bara väljas en gång.');
        return array_values($value);
    }
    if (in_array($kind, ['choice','yesno'], true)) {
        if (!is_string($value) || !in_array($value,$options,true)) throw new InvalidArgumentException('Välj ett giltigt alternativ.');
        return $value;
    }
    if (!valid_text($value,$kind === 'word' ? 40 : 500)) throw new InvalidArgumentException($kind === 'word' ? 'Skriv ett ord, högst 40 tecken.' : 'Skriv ett svar, högst 500 tecken.');
    $value = trim($value);
    if ($kind === 'word' && preg_match('/\s/u',$value)) throw new InvalidArgumentException('Skriv ett enda ord, utan mellanslag.');
    return $value;
}
