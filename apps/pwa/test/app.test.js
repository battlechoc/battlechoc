describe(
  '/ (Home Page)',
  () => {
    let page
    beforeAll(async () => {
      page = await global.__BROWSER__.newPage()
      await page.goto('https://google.com')
    }, 10000)

    afterAll(async () => {
      await page.close()
    })

    it('should load without error', async () => {
      let text = await page.evaluate(() => document.body.textContent)
      expect(text).toContain('google')
    })
  },
  10000
)

//const puppeteer = require('puppeteer');
//const devices = require('puppeteer/DeviceDescriptors');
//const iPhone = devices['iPhone 6'];

/*describe('browser', () => {
	beforeAll(async () => {
        await page.evaluateOnNewDocument(() => {
		    Object.defineProperty(navigator, "language", {
		        get: function() {
		            return "en-US";
		        }
		    });
		});
	});

    beforeEach(async () => {
        await page.goto('http://localhost:3000')
    });

    it('should start the game', async () => {
        await page.waitForSelector('.titleMenu .menuButton:first-child');
        await expect(page).toMatchElement('.titleMenu', { text: 'New Game' });
        await expect(page).toMatchElement('.titleMenu', { text: 'Tutorial' });
        await page.click('.titleMenu .menuButton:first-child');
        await page.waitForSelector('.active.button .stackedIcon');
        await page.click('.active.button .stackedIcon');
        await page.waitForSelector('.factory.enabled.preview');
    }, 20000);

    it('should start the tutorial', async () => {
        await page.waitForSelector('.titleMenu .menuButton:nth-child(2)');
        await page.click('.titleMenu .menuButton:nth-child(2)');
        await page.screenshot({path: 'screenshot.png'});
		await expect(page).toMatchElement('h6', { text: 'Interactive battlechoc Tutorial' });
        await page.click('.active.button .stackedIcon');
        await expect(page).toMatchElement('h6', { text: 'The chocolate factory' });
    }, 20000);
});*/

/*describe('iPhone', () => {
	beforeAll(async () => {
		await page.emulate(iPhone);
        await page.evaluateOnNewDocument(() => {
		    Object.defineProperty(navigator, "platform", {
		        get: function() {
		            return "iPhone";
		        }
		    });
		});
	});

    beforeEach(async () => {
        await page.goto('http://localhost:3000')
    });

    it('should show an info on iOS', async () => {
    	await page.waitForSelector('.titleMenu .menuButton:first-child');
    	await page.screenshot({path: 'screenshot.png'});
        await page.waitForSelector('.iosMessage');
    });
});*/
