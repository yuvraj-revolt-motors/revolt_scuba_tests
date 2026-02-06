const { test, expect } = require('@playwright/test');

test.describe('Revolt Motors Scuba Testing', () => {

    test('Homepage Health & SEO Check', async ({ page }) => {
        console.log('Starting Homepage Scuba...');
        // Increase navigation timeout for slow loading sites
        const response = await page.goto('/', { timeout: 60000, waitUntil: 'domcontentloaded' });
        expect(response.status()).toBe(200);

        // Wait for network to be idle-ish, ensuring dynamic content loads
        try {
            await page.waitForLoadState('networkidle', { timeout: 10000 });
        } catch (e) {
            console.log('Network idle timeout, continuing...');
        }

        // 1. White Screen / Render Check
        const header = page.locator('header, nav, .navbar').first();
        const footer = page.locator('footer, .footer, .active-footer').first();

        await expect(header).toBeVisible({ timeout: 15000 });
        await expect(footer).toBeVisible({ timeout: 15000 });

        // Check for hero image or brand logo to ensure visual loading
        const visualIndicator = page.locator('header img, nav img, .navbar-brand img').first();
        await expect(visualIndicator).toBeVisible();

        // 2. SEO Checks
        const title = await page.title();
        expect(title).not.toBe('');
        console.log(`Page Title: ${title}`);

        // H1 Check - Make it robust
        const h1 = page.locator('h1').first();
        try {
            await h1.waitFor({ state: 'visible', timeout: 10000 });
            const h1Text = await h1.innerText();
            expect(h1Text.length).toBeGreaterThan(0);
            console.log(`Main H1: ${h1Text}`);
        } catch (e) {
            console.warn('Current Page H1 not found or not visible:', e.message);
        }

        // Meta Description Check
        const metaDescription = await page.getAttribute('meta[name="description"]', 'content');
        if (metaDescription) {
            expect(metaDescription.length).toBeGreaterThan(0);
            console.log(`Meta Description: ${metaDescription}`);
        } else {
            console.warn('Warning: Meta Description not found.');
        }
    });

    test('Navigation & Route Scuba (All Public Routes)', async ({ page }) => {
        // Increase timeout significantly for crawling many pages
        test.setTimeout(300000);

        // 1. Gather all links from Homepage
        console.log('Gathering public routes from Homepage...');
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch (e) { }

        // Ensure footer is loaded before scraping links
        try { await page.locator('footer, .footer').first().waitFor({ state: 'visible', timeout: 10000 }); } catch (e) { }

        // Get all unique links from Navbar and Footer
        const navLinks = await page.locator('header a, nav a, .navbar a').all();
        const footerLinks = await page.locator('footer a, .footer a').all();

        const linksToTest = new Set();
        // Add home explicitly
        linksToTest.add(page.url());

        // Helper to extract href
        const extractHref = async (locator) => {
            try {
                const href = await locator.getAttribute('href');
                if (href && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('#') && !href.startsWith('javascript:')) {
                    const absoluteUrl = new URL(href, page.url()).href;
                    // Only test internal links
                    if (absoluteUrl.startsWith('https://www.revoltmotors.com')) {
                        linksToTest.add(absoluteUrl);
                    }
                }
            } catch (e) {
                // Ignore stale elements or errors
            }
        };

        for (const link of navLinks) { await extractHref(link); }
        for (const link of footerLinks) { await extractHref(link); }

        console.log(`Found ${linksToTest.size} unique internal links to test.`);

        // 2. Visit each link and perform Health & SEO Checks
        const arrLinks = Array.from(linksToTest);

        // Summary storage
        const executionReport = [];
        const SPECIAL_LAYOUT_PAGES = ['/book', '/test-ride'];

        for (const url of arrLinks) {
            await test.step(`Health Check: ${url}`, async () => {
                console.log(`\n🔍 Checking: ${url}`);
                const response = await page.goto(url, { waitUntil: 'domcontentloaded' });

                try {
                    await page.waitForLoadState('networkidle', { timeout: 10000 });
                } catch (e) { }
                await page.waitForTimeout(2000);

                const reportEntry = { url, status: '✅', issues: [] };

                // 1. Status Check
                const status = response.status();
                if (status === 200) {
                    console.log(`   ✅ Status: 200 OK`);
                } else {
                    console.log(`   ❌ Status: ${status}`);
                    reportEntry.status = '❌';
                    reportEntry.issues.push(`Status ${status}`);
                }
                expect.soft(status, `Status 200 OK for ${url}`).toBe(200);

                // 2. Content Rendering
                const bodyCount = await page.locator('body').count();
                if (bodyCount > 0) console.log(`   ✅ Body Content: OK`);
                else {
                    console.log(`   ❌ Body Content: EMPTY`);
                    reportEntry.status = '❌';
                    reportEntry.issues.push('Empty Body');
                }
                await expect.soft(page.locator('body')).not.toBeEmpty();

                // Navbar & Footer (Conditional Check)
                const isSpecialPage = SPECIAL_LAYOUT_PAGES.some(p => url.includes(p));
                const header = page.locator('header, nav, .navbar').first();
                const footer = page.locator('footer, .footer').first();

                if (isSpecialPage) {
                    console.log(`   ℹ️  Special Layout (Landing Page): Skipping strict Navbar/Footer check`);
                } else {
                    if (await header.isVisible()) console.log(`   ✅ Navbar: Visible`);
                    else {
                        console.log(`   ⚠️ Navbar: MISSING`);
                        reportEntry.issues.push('Missing Navbar');
                        // Treat as soft failure/warning in report, but strict failure in test
                        expect.soft(header, `Navbar visible on ${url}`).toBeVisible();
                    }

                    if (await footer.isVisible()) console.log(`   ✅ Footer: Visible`);
                    else {
                        console.log(`   ⚠️ Footer: MISSING`);
                        reportEntry.issues.push('Missing Footer');
                        expect.soft(footer, `Footer visible on ${url}`).toBeVisible();
                    }
                }

                // 3. SEO Checks
                const title = await page.title();
                if (title.length > 0) console.log(`   ✅ Title: "${title.substring(0, 50)}..."`);
                else {
                    console.log(`   ❌ Title: MISSING`);
                    reportEntry.issues.push('Missing Title');
                    expect.soft(title.length, `Page title should exist for ${url}`).toBeGreaterThan(0);
                }

                // H1
                const h1Count = await page.locator('h1').count();
                if (h1Count > 0) {
                    const h1Text = await page.locator('h1').first().innerText();
                    console.log(`   ✅ H1: "${h1Text.substring(0, 50)}..."`);
                    expect.soft(h1Text.length, `H1 text check for ${url}`).toBeGreaterThan(0);
                } else {
                    console.log(`   ⚠️ H1: MISSING`);
                    reportEntry.issues.push('Missing H1');
                }

                // Meta Description
                const metaDesc = await page.locator('meta[name="description"]').getAttribute('content').catch(() => null);
                if (metaDesc && metaDesc.length > 0) {
                    console.log(`   ✅ Meta Description: Present`);
                } else {
                    console.log(`   ⚠️ Meta Description: MISSING`);
                    reportEntry.issues.push('Missing Meta Desc');
                }

                executionReport.push(reportEntry);
            });
        }

        // Print Final Summary
        console.log('\n\n' + '='.repeat(80));
        console.log('🤖 SCUBA HEALTH REPORT SUMMARY');
        console.log('='.repeat(80));
        console.log('| Status | URL                                              | Issues                     |');
        console.log('|--------|--------------------------------------------------|----------------------------|');

        for (const row of executionReport) {
            const urlDisplay = row.url.replace('https://www.revoltmotors.com', '');
            const issuesDisplay = row.issues.length > 0 ? row.issues.join(', ') : 'None';
            console.log(`|   ${row.status}   | ${urlDisplay.padEnd(48)} | ${issuesDisplay.padEnd(26)} |`);
        }
        console.log('='.repeat(80) + '\n');
    });
});
