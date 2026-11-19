import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

export async function tabTo(page: Page, target: Locator): Promise<void> {
    for (let i = 0; i < 12; i++) {
        if (await target.evaluate(el => el === document.activeElement)) break;
        await page.keyboard.press('Tab');
    }
    await expect(target).toBeFocused();
}
