// Drive the visible picker, including the popover above dialogs and panels.
exports.select = async (page, id, value) => {
  const index = await page.locator('#' + id).evaluate((el, value) => [...el.options].findIndex(o => o.value === value), value);
  if (index < 0) throw new Error(`Missing ${id} option ${value}`);
  await page.locator('#' + id + '-button').click();
  await page.locator('#' + id + '-option-' + index).click();
};
