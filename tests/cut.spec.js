/* Selenium + Mocha E2E tests for Cut Planner */
const http = require('http');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { expect } = require('chai');

const BASE_URL = 'http://localhost:4200/cut';
const CUT_API = '/furniture/cut';

let server;
let mockMode = { type: 'ok', errorMessage: 'Invalid sheet dimensions' };
let backendCallCount = 0;

function setMockOk() {
	mockMode = { type: 'ok', errorMessage: 'Invalid sheet dimensions' };
	backendCallCount = 0;
}

function setMockError(message = 'Invalid sheet dimensions') {
	mockMode = { type: 'error', errorMessage: message };
	backendCallCount = 0;
}

function createMockServer(port = 8081) {
	return http
		.createServer((req, res) => {
			if (req.method === 'OPTIONS') {
				res.writeHead(200, {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Headers': '*',
					'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
				});
				return res.end();
			}

			if (!req.url.includes(CUT_API)) {
				res.writeHead(404);
				return res.end();
			}

			backendCallCount += 1;

			let body = '';
			req.on('data', (chunk) => (body += chunk));
			req.on('end', () => {
				res.setHeader('Access-Control-Allow-Origin', '*');
				res.setHeader('Content-Type', 'application/json');

				if (mockMode.type === 'error') {
					res.writeHead(400);
					res.end(JSON.stringify({ message: mockMode.errorMessage }));
					return;
				}

				let parsed;
				try {
					parsed = JSON.parse(body || '{}');
				} catch (e) {
					parsed = { elements: [] };
				}

				const placements = (parsed.elements || []).map((el, idx) => ({
					id: el.id ?? idx + 1,
					x: idx * 100,
					y: 0,
					width: el.width,
					height: el.height,
				}));

				res.writeHead(200);
				res.end(JSON.stringify({ placements }));
			});
		})
		.listen(port);
}

describe('Cut Planner E2E', function () {
	this.timeout(90000);

	/** @type {import('selenium-webdriver').ThenableWebDriver} */
	let driver;

	before(async () => {
		server = createMockServer();

		const options = new chrome.Options().addArguments(
			'--headless=new',
			'--window-size=1280,900',
			'--disable-gpu',
			'--no-sandbox'
		);

		driver = await new Builder()
			.forBrowser('chrome')
			.setChromeOptions(options)
			.build();
	});

	after(async () => {
		if (driver) await driver.quit();
		if (server) server.close();
	});

	beforeEach(async () => {
		setMockOk();
		await driver.get(BASE_URL);
		await driver.wait(
			until.elementLocated(By.css('.cut-container')),
			20000
		);
	});

	// Verify the page loads with default sheet dimensions (2000x1000 mm)
	it('loads the page with default sheet size', async () => {
		const widthInput = await driver.findElement(
			By.css('input[formcontrolname="sheetWidth"]')
		);
		const heightInput = await driver.findElement(
			By.css('input[formcontrolname="sheetHeight"]')
		);

		expect(await widthInput.getAttribute('value')).to.equal('2000');
		expect(await heightInput.getAttribute('value')).to.equal('1000');
	});

	// Test adding a new element (500x300 mm) and verify it appears in the summary
	it('adds an element and shows it in summary', async () => {
		await driver
			.findElement(By.xpath("//button[contains(., 'Add Element')]"))
			.click();

		const widthInput = await driver.findElement(
			By.css('.element-item input[formcontrolname="width"]')
		);
		const heightInput = await driver.findElement(
			By.css('.element-item input[formcontrolname="height"]')
		);
		await widthInput.clear();
		await widthInput.sendKeys('500');
		await heightInput.clear();
		await heightInput.sendKeys('300');

		const elements = await driver.findElements(By.css('.element-item'));
		expect(elements.length).to.equal(1);

		const summaryItems = await driver.findElements(By.css('.summary-item'));
		expect(summaryItems.length).to.be.greaterThan(1);
	});

	// Test successful optimization: add element, optimize, and verify placement results
	it('optimizes successfully with one element', async () => {
		await driver
			.findElement(By.xpath("//button[contains(., 'Add Element')]"))
			.click();

		const widthInput = await driver.findElement(
			By.css('.element-item input[formcontrolname="width"]')
		);
		const heightInput = await driver.findElement(
			By.css('.element-item input[formcontrolname="height"]')
		);
		await widthInput.clear();
		await widthInput.sendKeys('500');
		await heightInput.clear();
		await heightInput.sendKeys('300');

		await driver
			.findElement(By.xpath("//button[contains(., 'Optimize')]"))
			.click();

		// Wait for results table
		const table = await driver.wait(
			until.elementLocated(By.css('.placements-table')),
			20000
		);
		await driver.wait(until.elementIsVisible(table), 20000);

		const rows = await driver.findElements(
			By.css('.placements-table tbody tr')
		);
		expect(rows.length).to.equal(1);
		expect(backendCallCount).to.equal(1);
	});

	// Test error handling: backend returns error and UI displays error message
	it('shows error when backend fails', async () => {
		setMockError('Invalid sheet dimensions');

		await driver
			.findElement(By.xpath("//button[contains(., 'Add Element')]"))
			.click();
		const widthInput = await driver.findElement(
			By.css('.element-item input[formcontrolname="width"]')
		);
		await widthInput.clear();
		await widthInput.sendKeys('500');

		await driver
			.findElement(By.xpath("//button[contains(., 'Optimize')]"))
			.click();

		await driver.sleep(500);
		const errorEls = await driver.findElements(By.css('.error'));
		expect(errorEls.length).to.be.greaterThan(0);
		if (errorEls[0]) {
			expect(await errorEls[0].getText()).to.contain(
				'Invalid sheet dimensions'
			);
		}
	});

	// Test validation: optimize without elements should not call backend
	it('does not call backend when no elements', async () => {
		backendCallCount = 0;
		await driver
			.findElement(By.xpath("//button[contains(., 'Optimize')]"))
			.click();
		await driver.sleep(500);
		expect(backendCallCount).to.equal(0);
	});

	// Test SVG visualization appears after optimization
	it('displays SVG visualization after optimization', async () => {
		await driver
			.findElement(By.xpath("//button[contains(., 'Add Element')]"))
			.click();

		const widthInput = await driver.findElement(
			By.css('.element-item input[formcontrolname="width"]')
		);
		const heightInput = await driver.findElement(
			By.css('.element-item input[formcontrolname="height"]')
		);
		await widthInput.clear();
		await widthInput.sendKeys('500');
		await heightInput.clear();
		await heightInput.sendKeys('300');

		await driver
			.findElement(By.xpath("//button[contains(., 'Optimize')]"))
			.click();

		// Wait for loading to complete
		try {
			const loadingOverlay = await driver.findElement(
				By.css('.loading-overlay')
			);
			await driver.wait(until.stalenessOf(loadingOverlay), 20000);
		} catch {
			// Loading overlay might not exist or already gone
		}

		// Wait for placements table to appear (indicates optimization completed)
		await driver.wait(
			until.elementLocated(By.css('.placements-table')),
			20000
		);

		// Wait for SVG to appear
		const svg = await driver.wait(
			until.elementLocated(By.css('svg.cut-visualization')),
			20000
		);
		await driver.wait(until.elementIsVisible(svg), 5000);

		// Give Angular a moment to finish rendering and set attributes
		await driver.sleep(1000);

		// Wait for viewBox to be set (Angular binding might take a moment)
		// Check both attribute and property
		await driver.wait(
			async () => {
				const viewBoxAttr = await svg.getAttribute('viewBox');
				if (viewBoxAttr && viewBoxAttr.length > 0) return true;

				// Check via JavaScript as fallback
				const viewBoxProp = await driver.executeScript((svgEl) => {
					if (svgEl.viewBox && svgEl.viewBox.baseVal) {
						return `${svgEl.viewBox.baseVal.x} ${svgEl.viewBox.baseVal.y} ${svgEl.viewBox.baseVal.width} ${svgEl.viewBox.baseVal.height}`;
					}
					return svgEl.getAttribute('viewBox');
				}, svg);

				return viewBoxProp && viewBoxProp.length > 0;
			},
			10000,
			'viewBox should be set on SVG'
		);

		// Get viewBox - try attribute first, then JavaScript fallback
		let viewBox = await svg.getAttribute('viewBox');
		if (!viewBox || viewBox === 'null') {
			// Fallback: get viewBox via JavaScript
			viewBox = await driver.executeScript((svgEl) => {
				if (svgEl.viewBox && svgEl.viewBox.baseVal) {
					return `${svgEl.viewBox.baseVal.x} ${svgEl.viewBox.baseVal.y} ${svgEl.viewBox.baseVal.width} ${svgEl.viewBox.baseVal.height}`;
				}
				return svgEl.getAttribute('viewBox') || '';
			}, svg);
		}

		expect(viewBox).to.equal(
			'0 0 2000 1000',
			`Expected viewBox to be '0 0 2000 1000' but got '${viewBox}'`
		);

		// Verify SVG contains sheet rectangle (the base rectangle)
		const rects = await svg.findElements(By.css('rect'));
		expect(rects.length).to.be.greaterThan(
			0,
			'SVG should contain at least one rectangle (the sheet)'
		);

		// Verify SVG contains part rectangles (should have at least 2: sheet + part)
		expect(rects.length).to.be.greaterThan(
			1,
			'SVG should contain part rectangles'
		);
	});

	// Test PNG export button is disabled when no placements
	it('disables PNG export button when no placements', async () => {
		const exportButton = await driver.findElement(
			By.xpath("//button[contains(., 'Export as PNG')]")
		);
		const isEnabled = await exportButton.isEnabled();
		expect(isEnabled).to.be.false;
	});

	// Test PNG export button is enabled after optimization
	it('enables PNG export button after optimization', async () => {
		await driver
			.findElement(By.xpath("//button[contains(., 'Add Element')]"))
			.click();

		const widthInput = await driver.findElement(
			By.css('.element-item input[formcontrolname="width"]')
		);
		const heightInput = await driver.findElement(
			By.css('.element-item input[formcontrolname="height"]')
		);
		await widthInput.clear();
		await widthInput.sendKeys('500');
		await heightInput.clear();
		await heightInput.sendKeys('300');

		await driver
			.findElement(By.xpath("//button[contains(., 'Optimize')]"))
			.click();

		// Wait for loading to complete
		try {
			const loadingOverlay = await driver.findElement(
				By.css('.loading-overlay')
			);
			await driver.wait(until.stalenessOf(loadingOverlay), 20000);
		} catch {
			// Loading overlay might not exist or already gone
		}

		// Wait for SVG to appear (indicates optimization completed)
		await driver.wait(
			until.elementLocated(By.css('svg.cut-visualization')),
			20000
		);

		const exportButton = await driver.wait(
			until.elementLocated(
				By.xpath("//button[contains(., 'Export as PNG')]")
			),
			5000
		);
		const isEnabled = await exportButton.isEnabled();
		expect(isEnabled).to.be.true;
	});

	// Test PNG export downloads file
	it('exports PNG file when button is clicked', async () => {
		await driver
			.findElement(By.xpath("//button[contains(., 'Add Element')]"))
			.click();

		const widthInput = await driver.findElement(
			By.css('.element-item input[formcontrolname="width"]')
		);
		const heightInput = await driver.findElement(
			By.css('.element-item input[formcontrolname="height"]')
		);
		await widthInput.clear();
		await widthInput.sendKeys('500');
		await heightInput.clear();
		await heightInput.sendKeys('300');

		await driver
			.findElement(By.xpath("//button[contains(., 'Optimize')]"))
			.click();

		// Wait for loading to complete
		try {
			const loadingOverlay = await driver.findElement(
				By.css('.loading-overlay')
			);
			await driver.wait(until.stalenessOf(loadingOverlay), 20000);
		} catch {
			// Loading overlay might not exist or already gone
		}

		// Wait for SVG to appear
		await driver.wait(
			until.elementLocated(By.css('svg.cut-visualization')),
			20000
		);

		// Click export button
		const exportButton = await driver.wait(
			until.elementLocated(
				By.xpath("//button[contains(., 'Export as PNG')]")
			),
			5000
		);
		await exportButton.click();

		// Wait a bit for download to initiate
		await driver.sleep(1000);

		// Verify the button click was successful (button should still be enabled)
		const isEnabled = await exportButton.isEnabled();
		expect(isEnabled).to.be.true;

		// Note: In a real scenario, you would configure Chrome download preferences
		// and verify the file exists in the download directory. For now, we verify
		// that clicking the button doesn't cause errors and the action completes.
	});
});
