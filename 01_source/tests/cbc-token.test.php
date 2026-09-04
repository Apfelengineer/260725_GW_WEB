<?php
declare(strict_types=1);

require __DIR__ . '/../public/portal-access.php';
require __DIR__ . '/../renkon/renkon-config.php';

function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
function reference_token(string $data, string $secret = 'SecretKey999'): string {
    $method = 'AES-256-CBC';
    $iv = openssl_random_pseudo_bytes(openssl_cipher_iv_length($method));
    return base64_encode($iv . openssl_encrypt($data, $method, hash('sha256', $secret, true), OPENSSL_RAW_DATA, $iv));
}

// 添付コードと同じ形式の暗号文を受け取れることを検証します。
putenv('KPTC_PORTAL_TOKEN_KEY');
check(kptc_renkon_token_key() === hash('sha256', 'SecretKey999', true), 'Issuer key mismatch');
foreach (['000', '123', '999'] as $id) {
    check(kptc_portal_decrypt_token(reference_token('user_' . $id)) === ['userId'=>$id], 'Valid ID rejected');
}
$one = reference_token('user_123');
$two = reference_token('user_123');
check($one !== $two, 'Repeated token did not change');
foreach (['user_12','user_1234','user_abc','user_１２３','20260904_user_123',"user_123\n",' user_123'] as $invalid) {
    check(kptc_portal_decrypt_token(reference_token($invalid)) === null, 'Invalid plaintext accepted');
}
foreach (['', '***', base64_encode('short'), base64_encode(random_bytes(33)), reference_token('user_123','wrong-key'), openssl_encrypt('20260904_user_123','AES-128-ECB','test')] as $invalid) {
    check(kptc_portal_decrypt_token($invalid) === null, 'Invalid token accepted');
}
$_SESSION = ['portal_access_granted'=>true,'portal_user_id'=>'123','portal_token_date'=>'20260904'];
check(!kptc_portal_session_is_authorized(), 'Legacy ECB session accepted');
$_SESSION['portal_token_method'] = 'AES-256-CBC';
check(kptc_portal_session_is_authorized(), 'CBC session rejected');
echo "CBC compatibility, randomness, invalid input and legacy-session tests: OK\n";
