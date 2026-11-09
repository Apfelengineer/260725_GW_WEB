<?php
declare(strict_types=1);
/* 所属別の固定ID体系。表示順を変えても採番済みIDは変えません。 */
function kptc_member_prefix(string $group): string {
    return match ($group) { '電気通信係'=>'e', '試験室'=>'t', default=>throw new InvalidArgumentException('所属が不正です') };
}
function kptc_validate_member_identity_update(array $before, array $after): void {
    $known=array_column($before,null,'id');$seen=[];
    if(count($before)!==count($after))throw new InvalidArgumentException('ユーザーの追加・削除は管理画面で行ってください');
    foreach($after as $member){
        $id=is_array($member)?($member['id']??null):null;
        if(!is_string($id)||!isset($known[$id])||isset($seen[$id])||($known[$id]['group']??null)!==($member['group']??null)||($known[$id]['legacyId']??null)!==($member['legacyId']??null)) throw new InvalidArgumentException('内部ID・所属の変更はユーザー管理で行ってください。IDは自動採番です');
        $seen[$id]=true;
    }
}
function kptc_next_member_id(PDO $pdo, array $state, string $group): string {
    $prefix = kptc_member_prefix($group);
    $stmt=$pdo->prepare('SELECT value FROM app_meta WHERE key=?'); $stmt->execute(['member_id_counter_'.$prefix]);
    $maximum=(int)$stmt->fetchColumn();
    foreach ($state['members'] as $member) if (preg_match('/^'.$prefix.'([0-9]{3})$/D',(string)$member['id'],$m)) $maximum=max($maximum,(int)$m[1]);
    if ($maximum>=999) throw new InvalidArgumentException('この所属のID上限（999件）に達しました');
    $next=$maximum+1;
    $pdo->prepare('INSERT OR REPLACE INTO app_meta(key,value) VALUES(?,?)')->execute(['member_id_counter_'.$prefix,(string)$next]);
    return $prefix.str_pad((string)$next,3,'0',STR_PAD_LEFT);
}
function kptc_member_id_migration(PDO $pdo): void {
    if ($pdo->query("SELECT value FROM app_meta WHERE key='member_id_scheme_v1'")->fetchColumn()==='1') return;
    $pdo->beginTransaction();
    try {
        // 複数の初回アクセスでも一度だけ実行します。
        $pdo->exec("UPDATE app_meta SET value=value WHERE key='member_id_scheme_v1'");
        if ($pdo->query("SELECT value FROM app_meta WHERE key='member_id_scheme_v1'")->fetchColumn()==='1') { $pdo->commit(); return; }
        $row=$pdo->query('SELECT payload,version FROM app_state WHERE id=1')->fetch(PDO::FETCH_ASSOC);
        $state=json_decode($row['payload'],true,64,JSON_THROW_ON_ERROR);
        $counts=['e'=>0,'t'=>0]; $map=[]; $already=true; $seen=[];
        foreach ($state['members'] as $member) {
            $prefix=kptc_member_prefix((string)$member['group']);
            if (isset($seen[$member['id']])) throw new RuntimeException('移行元のユーザーIDが重複しています');
            $seen[$member['id']]=true;
            if (!preg_match('/^'.$prefix.'[0-9]{3}$/D',(string)$member['id']) || substr($member['id'],1)==='000') $already=false;
            if (++$counts[$prefix]>999) throw new RuntimeException('所属ごとのユーザー数が999件を超えています');
        }
        $counts=['e'=>0,'t'=>0];
        foreach ($state['members'] as &$member) {
            $old=(string)$member['id']; $prefix=kptc_member_prefix((string)$member['group']);
            $new=$already ? $old : $prefix.str_pad((string)++$counts[$prefix],3,'0',STR_PAD_LEFT);
            $map[$old]=$new; $member['id']=$new;
            if ($old!==$new) $member['legacyId']=$old;
        } unset($member);
        foreach ($state['schedules'] as &$schedule) {
            if (!isset($map[$schedule['memberId']])) throw new RuntimeException('所属ユーザーが不明な予定があります。移行を中止します');
            $schedule['memberId']=$map[$schedule['memberId']];
        } unset($schedule);
        $accounts=$pdo->query('SELECT id,member_id FROM auth_users')->fetchAll(PDO::FETCH_ASSOC);
        foreach ($accounts as $account) if (!isset($map[$account['member_id']])) throw new RuntimeException('所属ユーザーが不明なアカウントがあります。移行を中止します');
        $changed=$state!==json_decode($row['payload'],true);
        if ($changed) {
            $database=$pdo->query('PRAGMA database_list')->fetch(PDO::FETCH_ASSOC)['file'];
            if ($database!=='') {
                $directory=dirname($database).'/backups';
                if (!is_dir($directory)&&!mkdir($directory,0700,true)&&!is_dir($directory)) throw new RuntimeException('移行前のDB退避先を作成できません');
                $path=$directory.'/pre-id-scheme-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(3)).'.sqlite';
                $source=new SQLite3($database,SQLITE3_OPEN_READONLY); $target=new SQLite3($path);
                if (!chmod($path,0600) || !$source->backup($target)) throw new RuntimeException('移行前DBの退避に失敗しました');
                $target->close();$source->close();
            }
            foreach ($accounts as $account) if ($map[$account['member_id']]!==$account['member_id']) $pdo->prepare('UPDATE auth_users SET member_id=?,auth_revision=auth_revision+1 WHERE id=?')->execute([$map[$account['member_id']],$account['id']]);
            foreach($pdo->query('SELECT id,actor_id FROM audit_logs')->fetchAll(PDO::FETCH_ASSOC) as $entry) if(isset($map[$entry['actor_id']])) $pdo->prepare('UPDATE audit_logs SET actor_id=? WHERE id=?')->execute([$map[$entry['actor_id']],$entry['id']]);
            $pdo->prepare('UPDATE app_state SET payload=?,version=?,updated_at=? WHERE id=1')->execute([json_encode($state,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR),(int)$row['version']+1,date(DATE_ATOM)]);
            $pdo->prepare('INSERT INTO audit_logs(actor_id,actor_name,action,summary,before_json,after_json,created_at) VALUES(?,?,?,?,NULL,NULL,?)')->execute(['system','システム','ID体系移行','内部IDを電気通信係e001〜・試験室t001〜へ移行',date(DATE_ATOM)]);
            $pdo->exec("INSERT OR REPLACE INTO app_meta(key,value) VALUES('public_availability_pending','1')");
        }
        foreach (['e','t'] as $prefix) {
            $maximum=0;foreach ($state['members'] as $member) if (preg_match('/^'.$prefix.'([0-9]{3})$/D',$member['id'],$m)) $maximum=max($maximum,(int)$m[1]);
            $stmt=$pdo->prepare('SELECT value FROM app_meta WHERE key=?');$stmt->execute(['member_id_counter_'.$prefix]);
            $maximum=max($maximum,(int)$stmt->fetchColumn());
            $pdo->prepare('INSERT OR REPLACE INTO app_meta(key,value) VALUES(?,?)')->execute(['member_id_counter_'.$prefix,(string)$maximum]);
        }
        $pdo->prepare('INSERT OR REPLACE INTO app_meta(key,value) VALUES(?,?)')->execute(['member_id_mapping_v1',json_encode($map,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
        $pdo->exec("INSERT OR REPLACE INTO app_meta(key,value) VALUES('member_id_scheme_v1','1')");
        $pdo->commit();
    } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
}
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME'])===__FILE__) { http_response_code(404); exit; }
