async function navigateIframeTo(page, newPath, extraParams = {}) {
  const src = await page.getAttribute('#app-iframe', 'src');
  const url = new URL(src);
  url.pathname = newPath;
  Object.entries(extraParams).forEach(([k, v]) => url.searchParams.set(k, v));
  await page.evaluate((newSrc) => {
    document.querySelector('#app-iframe').src = newSrc;
  }, url.toString());
}

module.exports = { navigateIframeTo };