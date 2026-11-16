"""Run against a local static server: python3 test_l16.py http://127.0.0.1:8000"""
import sys
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(service_workers='block', timezone_id='Asia/Shanghai')
    page = context.new_page()
    page.goto(sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000/', wait_until='networkidle')
    page.wait_for_function('planReady')
    # Synthetic records live only in this isolated browser; no real user data is read/written.
    page.evaluate('''() => {
      LOG={};WK={};EX={};SUB={};PRO={};PR={};VER={};derive();render();
    }''')
    page.locator('[data-tabbtn="collect"]').click()
    hidden = page.locator('#shop .item').nth(15)
    assert hidden.locator('img,[data-view]').count() == 0
    page.evaluate('''() => {
      for(let i=0;i<84;i++){
        const d=addDays(START,i);
        LOG[d]={fit:true,steps:12000,diet:true,eng:true,edit:30,ai:true};
        VER['d_'+d]={status:'pass'};
      }
      for(let w=1;w<=12;w++){
        WK[w]={pub:true,review:true};
        for(const id of ['quest','git','m_gpt','m_gem','m_grok'])VER['w'+w+'_'+id]={status:'pass'};
      }
      derive();render();
    }''')
    assert page.evaluate('compute().cards.length') == 8
    image = hidden.locator('img')
    assert image.count() == 1
    assert image.get_attribute('src') == 'img/look-16.jpg'
    image.scroll_into_view_if_needed()
    page.wait_for_function('document.querySelector("#shop .item:last-child img").naturalWidth > 0')
    assert hidden.locator('[data-view]').count() == 0
    before = page.evaluate('({raw:localStorage.getItem(KEY),coins:compute().coins})')
    image.click()
    assert not page.locator('#imageViewer').evaluate('(d)=>d.open')
    assert page.evaluate('({raw:localStorage.getItem(KEY),coins:compute().coins})') == before
    # Existing purchase and view distinctions remain intact.
    page.evaluate('LOG={};WK={};VER={};PRO={owned:["l1"],look:"l1"};derive();render()')
    assert page.locator('#shop .item').nth(0).locator('[data-view="l1"]').count() == 1
    assert page.locator('#shop .item').nth(1).locator('img').count() == 1
    assert page.locator('#shop .item').nth(1).locator('[data-view]').count() == 0
    assert page.locator('#shop .item').nth(2).locator('img').count() == 0
    browser.close()
print('PASS: l16 hidden before unlock; 8/8 shows loaded look-16 thumbnail without viewer or data changes; owned/open/future rules preserved')
