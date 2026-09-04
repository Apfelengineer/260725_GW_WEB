<?php
declare(strict_types=1);
require __DIR__ . '/../public/scheduler-backup.php';

function check(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function mustFail(callable $action): void {
    try { $action(); } catch (Throwable $error) { return; }
    throw new RuntimeException('Expected failure did not occur');
}
$dir = sys_get_temp_dir() . '/kptc-backup-test-' . bin2hex(random_bytes(8));
mkdir($dir,0700);
try {
    $schedule = static fn($id,$date,$endDate) => ['id'=>$id,'memberId'=>'m1','date'=>$date,'endDate'=>$endDate,'start'=>'09:00','end'=>'17:00','title'=>"試験\nメモ付き",'category'=>'機器利用','memo'=>'日本語・引用符"を保存','private'=>true];
    $hash = password_hash('TestPassword123',PASSWORD_DEFAULT);
    $payload = [
        'schemaVersion'=>1,'kind'=>'kptc-scheduler-future','createdAt'=>'2026-09-04T22:00:00+09:00','fromDate'=>'2000-01-01','sourceVersion'=>10,
        'state'=>[
            'members'=>[['id'=>'m1','name'=>'試験ユーザー','group'=>'電気通信係','initials'=>'試','color'=>'#112233','extension'=>'123']],
            'categories'=>[['id'=>'c1','name'=>'機器利用','color'=>'#112233']],
            'schedules'=>[$schedule('past','2026-09-01','2026-09-03'),$schedule('today','2026-09-04','2026-09-04'),$schedule('span','2026-08-01','2026-09-05'),$schedule('future','2099-12-31','2099-12-31')],
        ],
        'authAccounts'=>[['id'=>1,'username'=>'test-user','member_id'=>'m1','password_hash'=>$hash,'role'=>'admin','enabled'=>1,'auth_revision'=>1,'created_at'=>'2026-01-01','updated_at'=>'2026-01-01','last_login_at'=>null]],
        'adminPasswordHash'=>$hash,
    ];
    $source = $dir . '/source.sqlite'; $backup = $dir . '/backups/scheduler-latest.json';
    kptc_backup_build_database($payload,$source);
    $originalHash = hash_file('sha256',$source);
    $result = kptc_backup_run($source,$backup,'2026-09-04');
    check($result['schedules']===3,'Wrong filtered count');
    check(hash_file('sha256',$source)===$originalHash,'Source DB changed');
    $saved = kptc_backup_read($backup);
    check(array_column($saved['state']['schedules'],'id')===['today','span','future'],'Date filtering failed');
    check($saved['state']['schedules'][0]['memo']===$payload['state']['schedules'][0]['memo'],'Text changed');
    check((fileperms($backup)&0777)===0600,'Backup permissions not private');
    check(!isset($saved['audit_logs']),'Audit data included');

    $restored = $dir.'/restored.sqlite';
    kptc_backup_restore($backup,$restored);
    $db = new PDO('sqlite:'.$restored);
    check($db->query('PRAGMA integrity_check')->fetchColumn()==='ok','Restore integrity failed');
    check((int)$db->query('SELECT COUNT(*) FROM audit_logs')->fetchColumn()===0,'History not empty');
    check($db->query('SELECT password_hash FROM auth_users')->fetchColumn()===$hash,'Account settings lost');
    check(password_verify('TestPassword123',$db->query("SELECT value FROM app_meta WHERE key='admin_mode_password_hash'")->fetchColumn()),'Admin password lost');
    check($db->query("SELECT value FROM app_meta WHERE key='room_demo_v1'")->fetchColumn()==='1','Demo could be re-seeded');
    $db=null;
    $restoredHash=hash_file('sha256',$restored);
    mustFail(fn()=>kptc_backup_restore($backup,$restored));
    check(hash_file('sha256',$restored)===$restoredHash,'Restore overwrote existing DB');

    kptc_backup_run($source,$backup,'2026-09-06');
    check(array_column(kptc_backup_read($backup)['state']['schedules'],'id')===['future'],'Old schedules were retained');
    check(count(glob($dir.'/backups/*.json'))===1,'Multiple generations retained');
    $good = hash_file('sha256',$backup);
    file_put_contents($dir.'/corrupt.sqlite','not a sqlite database');
    mustFail(fn()=>kptc_backup_run($dir.'/corrupt.sqlite',$backup,'2026-09-06'));
    mustFail(fn()=>kptc_backup_run($dir.'/missing.sqlite',$backup,'2026-09-06'));
    check(hash_file('sha256',$backup)===$good,'Corrupt source replaced good backup');
    $db=new PDO('sqlite:'.$source);
    $db->exec("UPDATE app_state SET payload='{}'"); $db=null;
    mustFail(fn()=>kptc_backup_run($source,$backup,'2026-09-06'));
    check(hash_file('sha256',$backup)===$good,'Malformed state replaced good backup');
    file_put_contents($dir.'/bad.json',str_replace('future','tampered',file_get_contents($backup)));
    mustFail(fn()=>kptc_backup_restore($dir.'/bad.json',$dir.'/bad-restore.sqlite'));
    check(!file_exists($dir.'/bad-restore.sqlite'),'Invalid JSON created DB');
    $lock=fopen($backup.'.lock','c');flock($lock,LOCK_EX);
    mustFail(fn()=>kptc_backup_run($source,$backup,'2026-09-06'));
    flock($lock,LOCK_UN);fclose($lock);
    check(count(glob($dir.'/backups/.backup-*'))===0 && count(glob($dir.'/backups/.restore-check-*'))===0,'Temporary data left behind');
    echo "Backup tests OK: date boundaries, unlimited future, ongoing schedules, restore, permissions, corruption, no overwrite, locking, latest only\n";
} finally {
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);
    foreach($iterator as $entry) { if($entry->isDir()) rmdir($entry->getPathname()); else unlink($entry->getPathname()); }
    rmdir($dir);
}
