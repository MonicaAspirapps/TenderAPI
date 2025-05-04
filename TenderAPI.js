// index.js
import express from 'express';
import { chromium } from 'playwright';
import cors from 'cors';
import morgan from 'morgan';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Root route
app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    message: '政府採購網標案資料 API',
    endpoints: {
      '/api/tenders': 'Get today\'s procurement tenders (GET)'
    }
  });
});

// Main endpoint for getting tenders (當天)
app.get('/api/tenders', async (req, res) => {
  try {
    const data = await scrapeGovProcurement();
    res.json(data);
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ 
      success: false, 
      message: `執行失敗: ${error.message}` 
    });
  }
});

/**
 * 主要執行函數 - 抓取政府採購網當天標案資料並輸出JSON
 * @returns {Object} 標案資料結果
 */
async function scrapeGovProcurement() {
  // 固定搜尋條件
  const searchCodes = [
    { code: '50003065', position: '3', description: '842 軟體執行服務' }, 
    { code: '50003066', position: '3', description: '843 資料處理服務' },
    { code: '50003067', position: '3', description: '844 資料庫服務' },
    { code: '50003069', position: '3', description: '849 其他電腦服務' },
    { code: '128', position: '2', description: '452 計算機及其零件與配件' }
  ];
  console.log('開始抓取政府採購網標案資料...');
  
  let browser;
  // 初始化結果物件
  let resultData = { 
    success: false, 
    data: [], 
    searchResults: [],
    timestamp: new Date().toISOString() 
  };
  
  // 用於去重
  const uniqueTenders = new Map();
  
  try {
    console.log('啟動瀏覽器...');
    // 在 Render 上運行時，必須使用無頭模式
    browser = await chromium.launch({ 
      headless: true,
      // 在 Render 上必須設定這些參數
      args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // 創建上下文和頁面
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // 設定超時時間較長，考慮到 Render 可能較慢
    page.setDefaultTimeout(30000);
    
    // 準備今天日期
    const today = new Date();
    const formattedDate = `${today.getFullYear()}%2F${String(today.getMonth() + 1).padStart(2, '0')}%2F${String(today.getDate()).padStart(2, '0')}`;
    
    // 針對每個搜尋條件執行搜尋
    for (const searchItem of searchCodes) {
      console.log(`開始搜尋條件: ${searchItem.description} (代碼: ${searchItem.code})`);
      
      try {
        // 統計該條件的搜尋結果
        const searchResult = {
          code: searchItem.code,
          position: searchItem.position,
          description: searchItem.description,
          count: 0,
          success: false,
          message: ""
        };
        
        // 構建查詢URL
        let queryUrl = `https://web.pcc.gov.tw/prkms/tender/common/proctrg/readTenderProctrg?pageSize=100&firstSearch=false&searchType=tpam&isBinding=N&isLogIn=N&level_1=on&tenderStatus=TENDER_STATUS_0&tenderWay=TENDER_WAY_ALL_DECLARATION`;
        
        if (searchItem.position === '3') {
          queryUrl += `&proctrgCode1=&proctrgCode2=&radProctrgCate=RAD_PROCTRG_CATE_3&proctrgCode3=${searchItem.code}`;
        } else if (searchItem.position === '2') {
          queryUrl += `&proctrgCode1=&radProctrgCate=RAD_PROCTRG_CATE_2&proctrgCode2=${searchItem.code}&proctrgCode3=`;
        }
        
        queryUrl += `&dateType=isDate&tenderStartDate=${formattedDate}&tenderEndDate=${formattedDate}`;
        
        await page.goto(queryUrl, { waitUntil: 'networkidle' });
      
        // 檢查是否有查詢結果
        const hasResults = await page.$$('#tpam > tbody > tr').then(rows => rows.length > 0);
        
        if (hasResults) {
          // 等待查詢結果表格加載
          console.log('等待查詢結果表格...');
          const rows = await page.$$('#tpam > tbody > tr');
          console.log(`找到 ${rows.length} 筆資料`);
          
          // 更新結果計數
          searchResult.count = rows.length;
          
          for (const row of rows) {
            try {
              // 先檢查行是否存在且有效
              const cellCount = await row.$$eval('td', cells => cells.length);
              if (cellCount < 9) {
                console.log('此行單元格數量不足，跳過處理');
                continue;
              }
              
              // 標案名稱與連結
              const titleEl = await row.$('td.tl > a');
              const title = titleEl ? await titleEl.innerText() : '[無標案名稱]';
              const link = titleEl ? await titleEl.getAttribute('href') : '';
          
              // 標案號碼
              let tenderNo = '[無標案號]';
              try {
                const rawText = await row.$eval('td.tl', el => el.innerText.trim());
                const lines = rawText.split('\n');
                tenderNo = lines[0]?.trim() ?? '[無標案號]';
              } catch (err) {
                console.error('擷取標案號碼時出錯:', err.message);
              }
          
              // 機關名稱
              const agencyEl = await row.$('td:nth-child(2)');
              const agency = agencyEl ? await agencyEl.innerText() : '[無機關]';
          
              // 標案類別
              const categoryEl = await row.$('td:nth-child(5)');
              const category = categoryEl ? await categoryEl.innerText() : '';
          
              // 公告日期
              const announceDateEl = await row.$('td:nth-child(7)');
              const announceDate = announceDateEl ? await announceDateEl.innerText() : '';
          
              // 截止投標日
              const deadlineEl = await row.$('td:nth-child(8)');
              const deadline = deadlineEl ? await deadlineEl.innerText() : '';
          
              // 預算金額
              const budgetEl = await row.$('td:nth-child(9)');
              const budget = budgetEl ? await budgetEl.innerText() : '';
              
              // 整理資料
              const tenderData = {
                title: title.trim(),
                link: link ? 'https://web.pcc.gov.tw' + link : '',
                tenderNo,
                agency: agency.trim(),
                category: category.trim(),
                announceDate: announceDate.trim(),
                deadline: deadline.trim(),
                budget: budget.trim(),
                searchCategory: searchItem.description  // 標記資料來源
              };
              
              // 檢查是否重複 (使用標案號作為唯一識別碼)
              if (!uniqueTenders.has(tenderNo)) {
                uniqueTenders.set(tenderNo, tenderData);
              }
              
            } catch (err) {
              console.error('處理資料列時出錯:', err.message);
            }
          }
          
          searchResult.success = true;
          searchResult.message = `成功擷取 ${searchResult.count} 筆資料`;
        } else {
          console.log(`沒有找到符合條件 "${searchItem.description}" 的資料`);
          searchResult.success = true;
          searchResult.message = "沒有符合條件的資料";
        }
        
        // 將該搜尋條件的結果添加到總結果中
        resultData.searchResults.push(searchResult);
        
      } catch (error) {
        console.error(`搜尋條件 "${searchItem.description}" 執行失敗:`, error);
        resultData.searchResults.push({
          code: searchItem.code,
          position: searchItem.position,
          description: searchItem.description,
          count: 0,
          success: false,
          message: `搜尋失敗: ${error.message}`
        });
      }
    }
    
    // 轉換 Map 到陣列
    resultData.data = Array.from(uniqueTenders.values());
    resultData.success = true;
    resultData.totalCount = resultData.data.length;
    resultData.uniqueAgencyCount = new Set(resultData.data.map(item => item.agency)).size;
    
    console.log('所有資料處理完成:');
    console.log(`共擷取 ${resultData.data.length} 筆不重複標案資料`);
    
    return resultData;
    
  } catch (error) {
    console.error('執行過程中發生未處理的錯誤:', error);
    resultData.success = false;
    resultData.message = `執行失敗: ${error.message}`;
    return resultData;
  } finally {
    if (browser) {
      console.log('關閉瀏覽器...');
      await browser.close();
    }
    console.log('搜尋處理完成');
  }
}

// 啟動服務器
app.listen(PORT, () => {
  console.log(`政府採購網標案資料 API 服務已啟動，監聽端口: ${PORT}`);
});

export default app;