<?php
declare(strict_types=1);
require __DIR__ . '/../origin/shared/public/schedule-import.php';
function expect(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function rejects(callable $work, string $message): void {
    try { $work(); } catch (InvalidArgumentException $error) { return; }
    throw new RuntimeException($message);
}
$state = ['members'=>[['id'=>'m6','name'=>'試験室']], 'categories'=>[['name'=>'機器利用']], 'schedules'=>[]];
$item = ['memberId'=>'m6','date'=>'2001-01-01','start'=>'09:00','end'=>'12:00','title'=>'移行試験','category'=>'機器利用'];
$raw = json_encode(['schedules'=>[$item]], JSON_UNESCAPED_UNICODE);
$items = kptc_import_document($raw);
$plan = kptc_import_plan($items,$state);
expect($plan['added'] === 1 && $plan['skipped'] === 0, 'Past schedule must be imported');
expect($plan['schedules'][0]['endDate'] === '2001-01-01', 'End date defaults to start date');
expect(str_starts_with($plan['schedules'][0]['id'],'import-'), 'Missing ID generated');
$state['schedules'] = $plan['schedules'];
$again = kptc_import_plan($items,$state);
expect($again['added'] === 0 && $again['skipped'] === 1, 'Repeated import must not duplicate');
expect(kptc_import_normalize(['id'=>'stable']+$item)['id']==='stable', 'Explicit ID retained');
expect(kptc_import_plan([array_merge($item,['date'=>'2100-01-01','endDate'=>'2100-01-03','start'=>'17:00','end'=>'09:00'])],$state)['added']===1, 'Unlimited future and multiple-day schedules');
foreach ([
    ['date'=>'2026-02-30'], ['endDate'=>'2000-12-31'], ['start'=>'25:00'], ['end'=>'09:00'],
    ['private'=>'false'], ['memberId'=>'unknown'], ['category'=>'unknown'], ['title'=>' '],
    ['timePreset'=>'invalid'], ['unexpected'=>'private payload'], ['id'=>"bad\nid"], ['memo'=>123],
] as $change) rejects(fn()=>kptc_import_plan([array_merge($item,$change)],$state), 'Invalid field must fail: '.json_encode($change));
rejects(fn()=>kptc_import_plan([$item,$item],$state), 'Duplicate ID/content inside file');
$conflict = array_merge($plan['schedules'][0],['title'=>'別内容']);
rejects(fn()=>kptc_import_plan([$conflict],$state), 'Existing ID must not be overwritten');
rejects(fn()=>kptc_import_plan([$item,array_merge($item,['memberId'=>'unknown'])],$state), 'Any invalid row aborts plan');
rejects(fn()=>kptc_import_document('{'), 'Malformed JSON');
rejects(fn()=>kptc_import_document('[]'), 'Empty file');
rejects(fn()=>kptc_import_document(str_repeat(' ',1048577)), 'Oversize');
rejects(fn()=>kptc_import_document(json_encode(array_fill(0,5001,$item))), 'Too many schedules');
expect(count(kptc_import_document(json_encode([$item])))===1,'Array format');
$payload=['schemaVersion'=>1,'kind'=>'kptc-scheduler-future','state'=>['schedules'=>[$item]],'authAccounts'=>[['password_hash'=>'NOT-IMPORTED']]];
$envelope=['payload'=>$payload,'sha256'=>hash('sha256',json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES))];
expect(kptc_import_document(json_encode($envelope))===[$item],'Backup schedules only');
$envelope['sha256']=str_repeat('0',64);
rejects(fn()=>kptc_import_document(json_encode($envelope)), 'Invalid backup checksum');
echo "Schedule import tests OK: formats, past/future, validation, stable IDs, duplicates, conflicts, checksum, limits\n";
