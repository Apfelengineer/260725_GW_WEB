/** 3桁のユーザーID入力を確認し、各ページへの独立したリンクを設定します。 */
const config = window.KPTC_RENKON_CONFIG ?? {};
const form = document.querySelector("#user-id-form");
const userIdInput = document.querySelector("#user-id");
const error = document.querySelector("#user-id-error");
const status = document.querySelector("#user-id-status");
const schedulerLink = document.querySelector("#scheduler-link");
const calendarLink = document.querySelector("#calendar-link");

calendarLink.href = config.calendarUrl || "../tamanegi/";
schedulerLink.href = config.schedulerUrl || "../origin/";

userIdInput.addEventListener("input", () => {
  userIdInput.value = userIdInput.value.replace(/\D/g, "").slice(0, 3);
  userIdInput.removeAttribute("aria-invalid");
  error.textContent = "";
  status.textContent = "";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const userId = userIdInput.value.trim();
  if (!/^\d{3}$/.test(userId)) {
    userIdInput.setAttribute("aria-invalid", "true");
    error.textContent = "ユーザーIDを半角数字3桁で入力してください。";
    userIdInput.focus();
    return;
  }

  status.textContent = `ユーザーID ${userId} を設定しました。`;
});
