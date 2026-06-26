function normalizeError(err, context = '') {
  const raw = err && err.message ? err.message : String(err || 'Unknown error');
  const lower = raw.toLowerCase();
  let code = 'UNKNOWN_ERROR';
  let message = 'خطای ناشناخته در سامانه رخ داد.';
  let hint = 'جزئیات خطا را بررسی کنید و اگر تکرار شد لاگ سرور را ببینید.';

  if (err && err.code === 'SQL_DISABLED' || lower.includes('sql is disabled for this server')) {
    code = 'SQL_DISABLED';
    message = 'SQL Server برای این سرور غیرفعال است.';
    hint = 'اگر این سرور SQL ندارد، همین وضعیت طبیعی است. اگر SQL دارد، در تنظیمات سرور گزینه SQL Server را فعال کنید.';
  } else if (lower.includes('login failed') || lower.includes('18456')) {
    code = 'SQL_LOGIN_FAILED';
    message = 'ورود به SQL Server ناموفق بود.';
    hint = 'نام کاربری، رمز عبور، Auth Type و دسترسی Login را بررسی کنید.';
  } else if (lower.includes('failed to connect') || lower.includes('econnrefused') || lower.includes('etimedout') || lower.includes('timeout')) {
    code = 'CONNECTION_FAILED';
    message = 'اتصال به سرور برقرار نشد یا Timeout شد.';
    hint = 'IP/Host، Port، Firewall، سرویس SQL/WinRM و دسترسی شبکه را بررسی کنید.';
  } else if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    code = 'HOST_NOT_FOUND';
    message = 'نام یا آدرس سرور پیدا نشد.';
    hint = 'Host/IP یا DNS را بررسی کنید.';
  } else if (lower.includes('access is denied') || lower.includes('access denied') || lower.includes('unauthorized')) {
    code = 'ACCESS_DENIED';
    message = 'دسترسی غیرمجاز است.';
    hint = 'دسترسی کاربر، رمز عبور، Permission و تنظیمات WinRM/SQL را بررسی کنید.';
  } else if (lower.includes('trustedhosts') || lower.includes('servernottrusted')) {
    code = 'WINRM_TRUSTED_HOSTS';
    message = 'WinRM به دلیل TrustedHosts اجازه اتصال نمی‌دهد.';
    hint = 'در PowerShell ادمین، TrustedHosts را برای سرور مقصد تنظیم کنید.';
  } else if (lower.includes('winrm') || lower.includes('wsman') || lower.includes('invoke-command')) {
    code = 'WINRM_ERROR';
    message = 'خطای WinRM در ارتباط با سرور رخ داد.';
    hint = 'فعال بودن WinRM، Firewall، Credential و Remote Management را بررسی کنید.';
  } else if (lower.includes('json') || lower.includes('unexpected token')) {
    code = 'INVALID_RESPONSE';
    message = 'پاسخ دریافت‌شده از سرور معتبر نبود.';
    hint = 'احتمالاً دستور PowerShell خروجی غیر JSON یا خطای متنی برگردانده است.';
  } else if (lower.includes('job is not currently running')) {
    code = 'JOB_NOT_RUNNING';
    message = 'Job در حال اجرا نیست.';
    hint = 'برای Stop کردن، Job باید Running باشد.';
  } else if (lower.includes('sp_testlinkedserver') || lower.includes('linked server') || lower.includes('openquery')) {
    code = 'LINKED_SERVER_FAILED';
    message = 'تست Linked Server ناموفق بود.';
    hint = 'Data Source، Login Mapping، Provider، Data Access و دسترسی شبکه Linked Server را بررسی کنید.';
  } else {
    message = raw.length > 220 ? raw.slice(0, 220) + '...' : raw;
  }

  return {
    error: message,
    code,
    hint,
    context,
    details: raw
  };
}

function sendError(res, err, status = 500, context = '') {
  const normalized = normalizeError(err, context);
  console.error(`[${normalized.code}] ${context}`, err);
  return res.status(status).json(normalized);
}

function asyncRoute(handler, context = '') {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (err) {
      sendError(res, err, err.statusCode || 500, context);
    }
  };
}

module.exports = { normalizeError, sendError, asyncRoute };
