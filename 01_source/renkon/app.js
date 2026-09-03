/** 3桁のユーザーID入力を確認し、サーバー側の暗号化入口へリンクします。 */
const config = window.KPTC_RENKON_CONFIG ?? {};
const form = document.querySelector("#user-id-form");
const userIdInput = document.querySelector("#user-id");
const error = document.querySelector("#user-id-error");
const status = document.querySelector("#user-id-status");
const schedulerLink = document.querySelector("#scheduler-link");
const calendarLink = document.querySelector("#calendar-link");
const schedulerDescription = schedulerLink.querySelector("small");

calendarLink.href = config.calendarUrl || "../tamanegi/";

function disableSchedulerLink() {
  schedulerLink.href = "#";
  schedulerLink.classList.add("is-disabled");
  schedulerLink.setAttribute("aria-disabled", "true");
  schedulerDescription.textContent = "先に3桁のユーザーIDを設定してください";
}

userIdInput.addEventListener("input", () => {
  userIdInput.value = userIdInput.value.replace(/\D/g, "").slice(0, 3);
  userIdInput.removeAttribute("aria-invalid");
  error.textContent = "";
  status.textContent = "";
  disableSchedulerLink();
});

schedulerLink.addEventListener("click", (event) => {
  if (schedulerLink.getAttribute("aria-disabled") !== "true") return;
  event.preventDefault();
  error.textContent = "先にユーザーIDを設定してください。";
  userIdInput.focus();
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
  schedulerLink.href = `./open-scheduler.php?user_id=${encodeURIComponent(userId)}`;
  schedulerLink.classList.remove("is-disabled");
  schedulerLink.removeAttribute("aria-disabled");
  schedulerDescription.textContent = `ユーザーID ${userId} で社内スケジューラーを開きます`;
});
