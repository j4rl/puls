<?php
declare(strict_types=1);

function validate_set_design($data,bool $existing=false): array {
    if (!is_array($data) || array_diff(array_keys($data),['colors','images'])) throw new InvalidArgumentException('Ogiltigt utseende för frågesetet.');
    $colors=$data['colors']??null;
    if ($colors!==null) {
        $keys=['background','surface','text','primary'];
        if (!is_array($colors) || count($colors)!==4 || array_diff($keys,array_keys($colors))) throw new InvalidArgumentException('Välj alla fyra temafärger.');
        foreach ($colors as $key=>$color) {
            if (!is_string($color) || !preg_match('/^#[0-9a-f]{6}$/iD',$color)) throw new InvalidArgumentException('Ange färger som sexsiffriga hexvärden.');
            $colors[$key]=strtolower($color);
        }
    }
    $images=$data['images']??[];
    if (!is_array($images) || array_diff(array_keys($images),['background','foreground','logo'])) throw new InvalidArgumentException('Ogiltiga bildfält.');
    $result=['colors'=>$colors,'images'=>[]];
    foreach (['background','foreground','logo'] as $slot) {
        $value=$images[$slot]??null;
        if ($value===null || ($existing && $value==='keep')) {$result['images'][$slot]=$value;continue;}
        if (!is_string($value) || strlen($value)>1400000 || !preg_match('#^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$#D',$value,$match)) throw new InvalidArgumentException('Välj PNG, JPEG eller WebP, högst 1 MB per bild.');
        $bytes=base64_decode($match[2],true);
        if ($bytes===false || strlen($bytes)>1048576) throw new InvalidArgumentException('Bilden får vara högst 1 MB.');
        $info=@getimagesizefromstring($bytes);
        if (!$info || $info['mime']!==$match[1] || $info[0]<1 || $info[1]<1 || $info[0]>4096 || $info[1]>4096) throw new InvalidArgumentException('Bilden är ogiltig eller större än 4096 × 4096 pixlar.');
        $result['images'][$slot]=['mime'=>$match[1],'content'=>$bytes];
    }
    return $result;
}

function save_set_design(int $id,array $design): void {
    foreach ($design['images'] as $slot=>$image) {
        if ($image==='keep')continue;
        query('DELETE FROM set_design_assets WHERE set_id=? AND slot=?','is',[$id,$slot]);
        if ($image!==null) query('INSERT INTO set_design_assets (set_id,slot,mime,content) VALUES (?,?,?,?)','isss',[$id,$slot,$image['mime'],$image['content']]);
    }
    $slots=query('SELECT slot FROM set_design_assets WHERE set_id=?','i',[$id])->get_result()->fetch_all(MYSQLI_ASSOC);
    $json=json_encode(['colors'=>$design['colors'],'images'=>array_column($slots,'slot')],JSON_THROW_ON_ERROR);
    query('INSERT INTO set_designs (set_id,design_json,version) VALUES (?,?,?) ON DUPLICATE KEY UPDATE design_json=VALUES(design_json),version=VALUES(version)','iss',[$id,$json,bin2hex(random_bytes(16))]);
}

function public_set_design(int $id,string $code): ?array {
    $row=query('SELECT design_json,version FROM set_designs WHERE set_id=?','i',[$id])->get_result()->fetch_assoc();
    if (!$row)return null;
    $data=json_decode($row['design_json'],true,32,JSON_THROW_ON_ERROR);
    $images=[];
    foreach ($data['images'] as $slot) $images[$slot]='api.php?'.http_build_query(['action'=>'set-image','code'=>$code,'slot'=>$slot,'v'=>$row['version']]);
    return ['colors'=>$data['colors'],'images'=>$images,'version'=>$row['version']];
}

function serve_set_image(string $code,int $id): void {
    $slot=$_GET['slot']??null;
    if (!in_array($slot,['background','foreground','logo'],true)) respond(['error'=>'Okänd bild.'],400);
    $row=query('SELECT mime,content FROM set_design_assets WHERE set_id=? AND slot=?','is',[$id,$slot])->get_result()->fetch_assoc();
    if (!$row)respond(['error'=>'Bilden finns inte.'],404);
    header('Content-Type: '.$row['mime']);
    header('Content-Length: '.strlen($row['content']));
    header('Content-Disposition: inline');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    echo $row['content'];exit;
}
