FROM node:18-slim

# 設定工作目錄
WORKDIR /app

# 安裝必要的依賴，包括 Playwright 的瀏覽器依賴
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    libgconf-2-4 \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# 複製 package*.json 文件
COPY package*.json ./

# 安裝依賴
RUN npm install

# 安裝 Playwright 瀏覽器
RUN npx playwright install chromium

# 複製其餘代碼
COPY . .

# 暴露端口
EXPOSE 3000

# 啟動應用
CMD ["node", "index.js"]