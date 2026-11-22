import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

test.use({ actionTimeout: 10000 });

const password = 'RosterLink language review passphrase!';
const switcher = (page, label) => page.getByRole('button', { name: label, exact: true });
const button = (page, name) => page.getByRole('button', { name, exact: true });

async function expectLanguage(page, language) {
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
  await expect(switcher(page, language === 'ar' ? 'English' : 'العربية')).toBeInViewport();
}

async function capture(page, info, name) {
  const dir = resolve('.local-data', 'language-review', info.project.name);
  await mkdir(dir, { recursive: true });
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  await page.screenshot({ path: resolve(dir, name + '.png'), animations: 'disabled',
    style: '.toast-region { visibility: hidden }', fullPage: name !== 'public-switcher' });
}

test('Arabic and English preserve drafts and content across the local recruitment journey', async ({ page, browser, baseURL }, info) => {
  test.setTimeout(120000);
  const recruiterContext = await browser.newContext({
    baseURL, viewport: page.viewportSize(), isMobile: info.project.use.isMobile, hasTouch: info.project.use.hasTouch,
    timezoneId: 'Asia/Riyadh',
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/');
    await expectLanguage(page, 'en');
    await expect(page.getByRole('heading', { name: /Get on\s*the roster/ })).toBeVisible();
    await capture(page, info, 'public-switcher');
    await switcher(page, 'العربية').click();
    await expectLanguage(page, 'ar');
    await expect(page.getByRole('heading', { name: /انضم إلى\s*الفريق/ })).toBeVisible();

    const email = `alex-${crypto.randomUUID()}@example.test`;
    await page.goto('/register');
    await expectLanguage(page, 'ar');
    await button(page, 'أنشئ حسابك').click();
    const emailField = page.getByLabel('البريد الإلكتروني');
    expect(await emailField.evaluate(input => input.validationMessage)).toBe('يرجى تعبئة هذا الحقل.');
    await emailField.fill(email);
    await page.getByLabel(/^كلمة المرور/).fill(password);
    await button(page, 'أنشئ حسابك').click();
    await expect(page).toHaveURL(/\/workspace$/);
    await expectLanguage(page, 'ar');
    await page.getByRole('button', { name: 'الحساب', exact: true }).click();
    await button(page, 'تسجيل الخروج').click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('البريد الإلكتروني').fill(email);
    await page.getByLabel(/^كلمة المرور/).fill('Incorrect passphrase.');
    await button(page, 'تسجيل الدخول').click();
    await expect(page.getByRole('alert')).toHaveText('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
    await switcher(page, 'English').click();
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
    await expect(page.getByLabel('Email address')).toHaveValue(email);
    await switcher(page, 'العربية').click();
    await page.getByLabel(/^كلمة المرور/).fill(password);
    await button(page, 'تسجيل الدخول').click();
    await expect(page).toHaveURL(/\/workspace$/);
    await page.reload();
    await expectLanguage(page, 'ar');
    await expect(page.getByRole('link', { name: 'عرض الموجز' })).toBeVisible();

    await page.goto('/profile');
    await page.getByLabel('اسم العرض في اللعبة').fill('Alex');
    await page.getByLabel('المنطقة أو الدولة').fill('Riyadh');
    await page.getByRole('checkbox', { name: 'الإنجليزية', exact: true }).check();
    await button(page, 'إنشاء الملف').click();
    await expect(page.getByRole('heading', { name: 'Alex', exact: true })).toBeVisible();

    const recruiter = await recruiterContext.newPage();
    recruiter.on('pageerror', error => errors.push(error.message));
    const { csrfToken } = await (await recruiter.request.get('/api/auth/session')).json();
    const registration = await recruiter.request.post('/api/auth/register', {
      headers: { 'X-CSRF-Token': csrfToken }, data: { email: `recruiter-${crypto.randomUUID()}@example.test`, password },
    });
    expect(registration.status()).toBe(201);
    await recruiter.goto('/organizations/new');
    await switcher(recruiter, 'العربية').click();
    await recruiter.getByLabel('اسم المنظمة').fill('Night Circuit Club');
    await recruiter.getByLabel('نبذة عن المنظمة').fill('A local competitive esports club.');
    await recruiter.getByLabel('منطقة المنظمة').fill('Riyadh');
    await button(recruiter, 'إنشاء صفحة المنظمة').click();
    await expect(recruiter.getByRole('heading', { name: 'Night Circuit Club' })).toBeVisible();
    await recruiter.getByRole('link', { name: 'أضف فريقًا', exact: true }).first().click();
    await recruiter.getByLabel('اسم الفريق').fill('Night Circuit RL');
    await recruiter.getByLabel('نبذة عن الفريق').fill('Rocket League 3v3 roster.');
    await recruiter.getByLabel('لعبة الفريق').selectOption({ label: 'Rocket League' });
    await button(recruiter, 'إنشاء فريق').click();
    await expect(recruiter.getByRole('heading', { name: 'Night Circuit RL', exact: true })).toBeVisible();
    await button(recruiter, 'شاغر جديد').click();
    await recruiter.getByLabel(/^الدور/).fill('Rotation player');
    await recruiter.getByLabel('متطلبات اللعبة').fill('Experience with 3v3 rotation.');
    await recruiter.getByLabel(/^المنصة/).selectOption({ label: 'حاسوب' });
    await recruiter.getByRole('textbox', { name: 'المنطقة', exact: true }).fill('Middle East');
    await recruiter.getByLabel(/^اللغة/).fill('Arabic / English');
    await recruiter.getByLabel(/^آخر موعد للتقديم/).fill('2099-11-04T20:00');
    await button(recruiter, 'نشر الشاغر').click();
    await expect(recruiter.getByText('اختر يومًا واحدًا للعب على الأقل.')).toBeVisible();
    await recruiter.getByRole('checkbox', { name: 'الأحد', exact: true }).check();
    await recruiter.getByRole('combobox', { name: 'وقت الانتهاء يوم الأحد' }).selectOption('23:15');
    await button(recruiter, 'نشر الشاغر').click();
    const openingLink = recruiter.getByRole('link', { name: 'عرض الشاغر', exact: true });
    await expect(openingLink).toBeVisible();
    const openingPath = await openingLink.getAttribute('href');

    await page.goto('/feed?tab=all');
    await expect(page.getByRole('heading', { name: 'الموجز', exact: true })).toBeVisible();
    const feedSearch = page.getByRole('navigation', { name: 'نطاق البحث' });
    await feedSearch.getByRole('link', { name: 'البحث عن حسابات', exact: true }).click();
    await page.getByLabel('ابحث عن حساب بالاسم أو اسم المستخدم').fill('Night Circuit');
    await button(page, 'بحث').click();
    const account = page.getByRole('article', { name: 'Night Circuit Club', exact: true });
    await account.getByRole('button', { name: 'متابعة', exact: true }).click();
    await expect(account.getByRole('button', { name: 'تتابع', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await switcher(page, 'English').click();
    await expect(page.getByLabel('Find accounts by name or handle')).toHaveValue('Night Circuit');
    await expect(page).toHaveURL(/find=accounts.*q=Night\+Circuit/);
    await switcher(page, 'العربية').click();
    await feedSearch.getByRole('link', { name: 'المنشورات', exact: true }).click();
    const body = 'Overtime replay from our Rocket League practice.';
    const comment = 'لقطة رائعة، أحسنتم!';
    await page.getByLabel('ابحث بنص المنشور أو باسم الناشر').fill('Overtime');
    await button(page, 'إنشاء منشور').click();
    await page.getByLabel('اكتب منشورًا').fill(body);
    await page.getByLabel('أضف وسائط', { exact: true }).setInputFiles('scripts/demo-media/rotation.jpg');
    await switcher(page, 'English').click();
    await expect(page.getByLabel('Search post text or author')).toHaveValue('Overtime');
    await expect(page.getByLabel('Write a post')).toHaveValue(body);
    await expect(page.getByRole('img', { name: 'Selected photo 1' })).toBeVisible();
    await switcher(page, 'العربية').click();
    await button(page, 'نشر المنشور').click();
    const card = page.locator('.feed-stream .post-card').filter({ hasText: body });
    await expect(card.getByRole('link', { name: 'Alex', exact: true })).toBeVisible();
    const photo = card.getByRole('button', { name: /تكبير الصورة/ });
    await photo.click();
    await expect(card.locator('dialog')).toBeVisible();
    await card.getByRole('button', { name: 'إغلاق الصورة' }).click();
    await card.getByRole('button', { name: '٠ تعليق', exact: true }).click();
    await card.getByLabel('اكتب تعليقًا').fill(comment);
    await card.getByRole('button', { name: 'نشر التعليق' }).click();
    await expect(card.locator('.post-body').first()).toHaveText(body);
    await expect(card.locator('.post-body').first()).toHaveCSS('direction', 'ltr');
    await expect(card.locator('.post-comments .post-body')).toHaveText(comment);
    await expect(card.locator('.post-comments .post-body')).toHaveCSS('direction', 'rtl');
    await switcher(page, 'English').click();
    await expect(page.getByRole('heading', { name: 'Feed', exact: true })).toBeVisible();
    await expect(card.locator('.post-comments .post-body')).toHaveText(comment);
    await expect(card.getByRole('link', { name: 'Alex', exact: true }).first()).toBeVisible();
    await switcher(page, 'العربية').click();
    await capture(page, info, 'arabic-feed');

    await page.goto('/openings?role=Rotation');
    await expect(page.getByRole('heading', { name: 'Rotation player' })).toBeVisible();
    const filters = page.locator('.opening-filters');
    if (info.project.use.isMobile) await filters.getByRole('button', { name: 'تصفية الشواغر' }).click();
    await filters.getByLabel('المنطقة').fill('Riyadh');
    await switcher(page, 'English').click();
    await expect(filters.getByLabel('Role', { exact: true })).toHaveValue('Rotation');
    await expect(filters.getByLabel('Region', { exact: true })).toHaveValue('Riyadh');
    await expect(page).toHaveURL(/\/openings\?role=Rotation$/);
    await switcher(page, 'العربية').click();
    await page.goto(openingPath);
    await expect(page.locator('.opening-facts')).toContainText('حاسوب');
    await expect(page.getByText(/الأحد.*23:15/)).toBeVisible();
    const introduction = 'I lead communication during 3v3 rotations.';
    await page.getByLabel('لماذا ترى أنك مناسب لهذا الدور؟').fill(introduction);
    await page.getByLabel('أوقات توفرك لهذا الفريق').fill('Sunday after 20:00 Asia/Riyadh.');
    await switcher(page, 'English').click();
    await expect(page.getByLabel('Why are you a good fit?')).toHaveValue(introduction);
    await expect(page.getByLabel('Availability for this team')).toHaveValue('Sunday after 20:00 Asia/Riyadh.');
    await switcher(page, 'العربية').click();
    const [submission] = await Promise.all([
      page.waitForResponse(response =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.startsWith('/api/applications/opening/')),
      button(page, 'تقديم الطلب').click(),
    ]);
    expect(submission.ok(), 'The application submission should succeed').toBe(true);
    await expect(page.locator('.application-status')).toHaveText('تم التقديم');

    await recruiter.getByRole('link', { name: 'مراجعة المتقدمين', exact: true }).click();
    await recruiter.getByLabel('حالة الطلب').selectOption('submitted');
    await switcher(recruiter, 'English').click();
    await expect(recruiter.getByLabel('Application status')).toHaveValue('submitted');
    await switcher(recruiter, 'العربية').click();
    await recruiter.getByRole('link', { name: 'مراجعة الطلب', exact: true }).click();
    await expect(recruiter.getByRole('heading', { name: 'Alex', exact: true })).toBeVisible();
    await expect(recruiter.getByText(introduction, { exact: true })).toBeVisible();
    await button(recruiter, 'بدء المراجعة').click();
    await expect(recruiter.locator('.application-status')).toHaveText('قيد المراجعة');
    await button(recruiter, 'إضافة إلى القائمة المختصرة').click();
    await expect(recruiter.locator('.application-status')).toHaveText('في القائمة المختصرة');
    await button(recruiter, 'إرسال دعوة تجربة').click();
    await recruiter.getByLabel('تاريخ التجربة ووقتها').fill('2099-11-05T20:00');
    const notes = 'Join the practice lobby 10 minutes early.';
    await recruiter.getByLabel('ملاحظات التجربة').fill(notes);
    await switcher(recruiter, 'English').click();
    await expect(recruiter.getByLabel('Tryout notes')).toHaveValue(notes);
    await expect(recruiter.getByLabel('Tryout date and time')).toHaveValue('2099-11-05T20:00');
    await switcher(recruiter, 'العربية').click();
    await button(recruiter, 'إرسال دعوة تجربة').click();
    await expect(recruiter.locator('.application-invitation .badge')).toHaveText('بانتظار الرد');
    await capture(recruiter, info, 'arabic-recruiter-review');
    await page.getByRole('link', { name: 'الإشعارات', exact: true }).click();
    await page.getByRole('link', { name: 'دعوة تجربة جديدة', exact: true }).click();
    await expect(page.getByText(notes, { exact: true })).toBeVisible();
    await button(page, 'قبول الدعوة').click();
    await expect(page.locator('.application-invitation .badge')).toHaveText('مقبول');
    await recruiter.reload();
    await expectLanguage(recruiter, 'ar');
    await expect(recruiter.locator('.application-invitation .badge')).toHaveText('مقبول');
    await button(recruiter, 'قبول الطلب').click();
    await expect(recruiter.getByText('هل تريد قبول الطلب وإشعار اللاعب؟')).toBeVisible();
    await button(recruiter, 'قبول الطلب').click();
    await expect(recruiter.locator('.application-status')).toHaveText('مقبول');
    expect(errors).toEqual([]);
  } finally {
    await recruiterContext.close();
  }
});
