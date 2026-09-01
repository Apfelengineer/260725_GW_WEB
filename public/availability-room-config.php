<?php
declare(strict_types=1);

/*
 * 「試験室」所属のユーザーを公開対象へ自動変換します。
 * 新しい試験室はスケジューラーでユーザーを追加し、<ユーザーID>.pngを外部側へ置くだけで公開できます。
 * スケジューラー上の名称と公開名称・説明を変えたい既存室だけ、この上書き一覧へ記載します。
 */
function kptc_public_room_overrides(): array {
    return [
        'm6'=>['name'=>'電波暗室'],
        'm7'=>['name'=>'電磁波妨害評価装置(G-TEM)'],
        'm8'=>[
            'name'=>'パルスサージシステム',
            'description'=>'(入力インパルス試験機、静電気試験機、サージイミュニティ試験機、FTB試験機、低周波EMC試験機)',
        ],
    ];
}

function kptc_public_rooms_from_state(array $state): array {
    $overrides = kptc_public_room_overrides();
    $rooms = [];
    foreach ($state['members'] ?? [] as $member) {
        if (!is_array($member) || ($member['group'] ?? '') !== '試験室') continue;
        $memberId = trim((string)($member['id'] ?? ''));
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/', $memberId)) throw new InvalidArgumentException('公開する試験室のユーザーIDが不正です');
        $override = is_array($overrides[$memberId] ?? null) ? $overrides[$memberId] : [];
        $name = trim((string)($override['name'] ?? $member['name'] ?? ''));
        if ($name === '') throw new InvalidArgumentException('公開する試験室名がありません');
        $rooms[] = [
            'id'=>$memberId,
            'memberId'=>$memberId,
            'name'=>$name,
            'image'=>(string)($override['image'] ?? ($memberId . '.png')),
            'description'=>(string)($override['description'] ?? ''),
        ];
    }
    if ($rooms === []) throw new InvalidArgumentException('公開する試験室がありません');
    return $rooms;
}

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}
