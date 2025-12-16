/**
 * 아이콘 생성 스크립트
 * 보라색 선물상자 아이콘 생성
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// 보라색 선물상자 SVG 아이콘
const createGiftBoxSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea"/>
      <stop offset="100%" style="stop-color:#764ba2"/>
    </linearGradient>
    <linearGradient id="boxGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#a855f7"/>
      <stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
    <linearGradient id="lidGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#c084fc"/>
      <stop offset="100%" style="stop-color:#a855f7"/>
    </linearGradient>
  </defs>

  <!-- 배경 (둥근 사각형) -->
  <rect x="${size * 0.05}" y="${size * 0.05}"
        width="${size * 0.9}" height="${size * 0.9}"
        rx="${size * 0.18}" ry="${size * 0.18}"
        fill="url(#bgGrad)"/>

  <!-- 선물 상자 본체 -->
  <rect x="${size * 0.2}" y="${size * 0.42}"
        width="${size * 0.6}" height="${size * 0.4}"
        rx="${size * 0.04}" ry="${size * 0.04}"
        fill="url(#boxGrad)"/>

  <!-- 선물 상자 뚜껑 -->
  <rect x="${size * 0.15}" y="${size * 0.3}"
        width="${size * 0.7}" height="${size * 0.15}"
        rx="${size * 0.03}" ry="${size * 0.03}"
        fill="url(#lidGrad)"/>

  <!-- 세로 리본 -->
  <rect x="${size * 0.44}" y="${size * 0.3}"
        width="${size * 0.12}" height="${size * 0.52}"
        fill="#fbbf24"/>

  <!-- 가로 리본 -->
  <rect x="${size * 0.2}" y="${size * 0.5}"
        width="${size * 0.6}" height="${size * 0.1}"
        fill="#fbbf24"/>

  <!-- 리본 매듭 (왼쪽) -->
  <ellipse cx="${size * 0.38}" cy="${size * 0.26}"
           rx="${size * 0.08}" ry="${size * 0.06}"
           fill="#fcd34d" transform="rotate(-30 ${size * 0.38} ${size * 0.26})"/>

  <!-- 리본 매듭 (오른쪽) -->
  <ellipse cx="${size * 0.62}" cy="${size * 0.26}"
           rx="${size * 0.08}" ry="${size * 0.06}"
           fill="#fcd34d" transform="rotate(30 ${size * 0.62} ${size * 0.26})"/>

  <!-- 리본 중심 -->
  <circle cx="${size * 0.5}" cy="${size * 0.27}" r="${size * 0.05}" fill="#f59e0b"/>

  <!-- 하이라이트 -->
  <rect x="${size * 0.22}" y="${size * 0.44}"
        width="${size * 0.08}" height="${size * 0.2}"
        rx="${size * 0.02}" ry="${size * 0.02}"
        fill="rgba(255,255,255,0.3)"/>
</svg>
`;

// 출력 디렉토리 확인 및 생성
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// 아이콘 생성 함수
const generateIcon = async (size, outputPath) => {
  const svg = createGiftBoxSvg(size);
  const svgBuffer = Buffer.from(svg);

  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(outputPath);

  console.log(`Generated: ${outputPath} (${size}x${size})`);
};

// 메인 실행
const main = async () => {
  const projectRoot = path.join(__dirname, '..');

  // Chrome Extension 아이콘
  const chromeIconsDir = path.join(projectRoot, 'chrome-extension', 'assets', 'icons');
  ensureDir(chromeIconsDir);

  const chromeIconSizes = [16, 48, 128];
  for (const size of chromeIconSizes) {
    await generateIcon(size, path.join(chromeIconsDir, `icon-${size}.png`));
  }

  // PWA 아이콘
  const pwaIconsDir = path.join(projectRoot, 'mobile-pwa', 'assets', 'icons');
  ensureDir(pwaIconsDir);

  const pwaIconSizes = [32, 72, 96, 128, 144, 152, 192, 384, 512];
  for (const size of pwaIconSizes) {
    await generateIcon(size, path.join(pwaIconsDir, `icon-${size}.png`));
  }

  console.log('\nAll icons generated successfully!');
};

main().catch(console.error);
