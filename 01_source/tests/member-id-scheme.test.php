<?php
declare(strict_types=1);
require __DIR__.'/../origin/shared/public/member-id-scheme.php';
require __DIR__.'/../origin/shared/public/availability-room-config.php';
function verify(bool $ok,string $message): void { if(!$ok)throw new RuntimeException($message); }
$dir=sys_get_temp_dir().'/kptc-id-test-'.bin2hex(random_bytes(8));mkdir($dir,0700);
try {
    $pdo=new PDO('sqlite:'.$dir.'/test.sqlite');$pdo->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);
    $pdo->exec('CREATE TABLE app_state(id INTEGER PRIMARY KEY,payload TEXT,version INTEGER,updated_at TEXT); CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE auth_users(id INTEGER PRIMARY KEY,member_id TEXT,password_hash TEXT,auth_revision INTEGER); CREATE TABLE audit_logs(id INTEGER PRIMARY KEY,actor_id TEXT,actor_name TEXT,action TEXT,summary TEXT,before_json TEXT,after_json TEXT,created_at TEXT)');
    $members=[];foreach(['m1'=>'電気通信係','m6'=>'試験室','m2'=>'電気通信係','m7'=>'試験室','m8'=>'試験室'] as $id=>$group)$members[]=['id'=>$id,'group'=>$group,'name'=>$id];
    $schedules=[];foreach($members as $m)$schedules[]=['id'=>'s-'.$m['id'],'memberId'=>$m['id'],'title'=>'保持する予定'];
    $state=['members'=>$members,'schedules'=>$schedules,'categories'=>[]];
    $pdo->prepare('INSERT INTO app_state VALUES(1,?,12,?)')->execute([json_encode($state),date(DATE_ATOM)]);
    $pdo->exec("INSERT INTO auth_users VALUES(1,'m1','HASH-UNCHANGED',1),(2,'m6','ROOM-HASH',1)");
    kptc_member_id_migration($pdo);
    $now=json_decode($pdo->query('SELECT payload FROM app_state')->fetchColumn(),true);
    verify(array_column($now['members'],'id')===['e001','t001','e002','t002','t003'],'Display-order numbering per group');
    verify(array_column($now['schedules'],'memberId')===['e001','t001','e002','t002','t003'],'Schedule links');
    verify(count($now['schedules'])===5,'All schedules retained');
    verify($pdo->query('SELECT member_id FROM auth_users WHERE id=1')->fetchColumn()==='e001','Account link');
    verify($pdo->query('SELECT password_hash FROM auth_users WHERE id=1')->fetchColumn()==='HASH-UNCHANGED','Password unchanged');
    verify((int)$pdo->query('SELECT auth_revision FROM auth_users WHERE id=1')->fetchColumn()===2,'Old sessions invalidated');
    $rooms=kptc_public_rooms_from_state($now);
    verify(array_column($rooms,'id')===['t001','t002','t003'],'Public IDs reorganized');
    verify(array_column($rooms,'image')===['m6.png','m7.png','m8.png'],'Existing images preserved');
    $backups=glob($dir.'/backups/pre-id-scheme-*.sqlite');verify(count($backups)===1,'One backup before migration');
    $old=new PDO('sqlite:'.$backups[0]);verify(json_decode($old->query('SELECT payload FROM app_state')->fetchColumn(),true)['members'][0]['id']==='m1','Backup retains original data');unset($old);
    kptc_member_id_migration($pdo);verify((int)$pdo->query('SELECT version FROM app_state')->fetchColumn()===13,'Idempotent migration');
    verify(kptc_next_member_id($pdo,$now,'電気通信係')==='e003','Next department ID');
    verify(kptc_next_member_id($pdo,$now,'電気通信係')==='e004','No reuse of allocated ID');
    verify(kptc_next_member_id($pdo,$now,'試験室')==='t004','Independent room sequence');
    $pdo->exec("UPDATE app_meta SET value='999' WHERE key='member_id_counter_e'");
    try{kptc_next_member_id($pdo,$now,'電気通信係');throw new RuntimeException('Expected limit failure');}catch(InvalidArgumentException $expected){}
    // 不明な参照先があれば、ユーザー・予定・版番号・完了印を変更しません。
    $bad=$now;$bad['schedules'][0]['memberId']='missing';
    $pdo->exec("DELETE FROM app_meta WHERE key='member_id_scheme_v1'");
    $pdo->prepare('UPDATE app_state SET payload=?')->execute([json_encode($bad)]);
    try{kptc_member_id_migration($pdo);throw new LogicException('Expected orphan failure');}catch(RuntimeException $expected){verify(!($expected instanceof LogicException),'Orphan must be rejected');}
    verify((int)$pdo->query('SELECT version FROM app_state')->fetchColumn()===13,'Failed migration rolled back');
    verify($pdo->query("SELECT value FROM app_meta WHERE key='member_id_scheme_v1'")->fetchColumn()===false,'No completion mark on failure');
    unset($pdo);
    echo "ID scheme tests OK: e/t numbering, references, public IDs/images, backup, idempotence, counters and rollback\n";
}finally{
    unset($pdo);
    foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $path){if($path->isDir())rmdir($path->getPathname());else unlink($path->getPathname());}rmdir($dir);
}
