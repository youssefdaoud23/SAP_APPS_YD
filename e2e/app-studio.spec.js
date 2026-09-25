'use strict';

const { test, expect } = require('@playwright/test');

test.describe.serial('Invarture App Studio browser shell', () => {
  test('loads current build and injects enterprise platform navigation', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('/');
    await expect(page.locator('.topbar-title h1')).toContainText('Overview');
    await expect(page.locator('.workspace-card')).toContainText(/v0\.\d+\.\d+\s*·\s*[0-9a-f]{8}/);
    await expect(page.locator('[data-v09-launchpad]')).toBeVisible();
    await expect(page.locator('[data-v09-workflows]')).toBeVisible();
    await expect(page.locator('[data-v09-tasks]')).toBeVisible();
    await expect(page.locator('[data-api-designer-nav]')).toBeVisible();
    await expect(page.locator('[data-rfc09-nav]')).toBeVisible();
    await page.waitForTimeout(1200);
    expect(pageErrors).toEqual([]);
  });

  test('enterprise component can be added and survives reload', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-nav="studio"]').click();
    await expect(page.locator('.topbar-title h1')).toHaveText('App Studio');
    const valueHelp = page.locator('[data-v09-add-type="valueHelp"]');
    await expect(valueHelp).toBeVisible();
    await valueHelp.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-v09-add-type="valueHelp"]')).toBeVisible();
    const count = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('invarture-app-studio-v2') || '{}');
      const app = (state.apps || []).find(item => item.id === state.currentAppId);
      const page = (app?.pages || []).find(item => item.id === state.currentPageId);
      return (page?.components || []).filter(item => item.type === 'valueHelp').length;
    });
    expect(count).toBeGreaterThan(0);
    await expect(page.locator('.v09-value-help').last()).toBeVisible();
  });

  test('role-aware Launchpad opens a published application', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-v09-launchpad]').click();
    await expect(page.getByText('Invarture Launchpad', { exact:true })).toBeVisible();
    await expect(page.locator('.v09-launch-tile')).toContainText('Purchase Orders');
    await expect(page.locator('[data-v09-launch-manage]')).toBeVisible();
    await page.locator('[data-v09-launch="purchase-orders"]').last().click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.runtime-preview')).toBeVisible();
    await expect(page.locator('.runtime-preview')).toContainText('Purchase Orders');
  });

  test('Workflow Designer creates a durable workflow and Task Inbox remains usable', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-v09-workflows]').click();
    await expect(page.getByText('Workflow Designer', { exact:true })).toBeVisible();
    await page.locator('[data-v09-wf-new]').click();
    await expect(page.locator('#v09-wf-name')).toHaveValue('New Approval Workflow');
    await expect(page.locator('.v09-wf-step')).toHaveCount(5);
    await page.locator('[data-v09-wf-close]').click();
    await page.locator('[data-v09-tasks]').click();
    await expect(page.getByText('Task Inbox', { exact:true })).toBeVisible();
    await expect(page.locator('.v09-workflow-window')).toBeVisible();
  });

  test('API Designer and RFC/BAPI Center expose the new governed tools', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-api-designer-nav]').click();
    await expect(page.locator('.topbar-title h1')).toHaveText('API Designer');
    await expect(page.locator('#apiDesignerV08')).toBeVisible();
    await page.locator('[data-rfc09-nav]').click();
    await expect(page.getByText('SAP RFC / BAPI Center', { exact:true })).toBeVisible();
    await expect(page.locator('.rfc09-window')).toBeVisible();
  });
});
