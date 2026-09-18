import { readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * `emptyOutDir` phải tắt để giữ wwwroot/uploads, nhưng hệ quả là wwwroot/assets
 * tích luỹ mọi bundle của mọi lần build trước (đã lên tới 35 MB / 63 file).
 * Plugin này chỉ dọn đúng thư mục assets ngay trước khi build.
 */
function cleanAssetsDir(): Plugin {
  let assetsPath = ''
  return {
    name: 'iris-clean-assets-dir',
    apply: 'build',
    configResolved(config) {
      // config.build.outDir đã được Vite phân giải thành đường dẫn tuyệt đối.
      assetsPath = resolve(config.root, config.build.outDir, config.build.assetsDir)
    },
    buildStart() {
      if (!assetsPath) return
      // Xoá NỘI DUNG chứ không xoá thư mục: khi server .NET đang chạy và phục vụ
      // từ wwwroot, nó giữ handle lên thư mục nên rmdir sẽ báo EBUSY.
      let entries: string[]
      try {
        entries = readdirSync(assetsPath)
      } catch {
        return // chưa có thư mục assets, không cần dọn
      }
      for (const entry of entries) {
        try {
          rmSync(resolve(assetsPath, entry), { recursive: true, force: true })
        } catch {
          // File đang bị khoá (server giữ). Bỏ qua — tên file có băm nội dung
          // nên bản cũ không ghi đè bản mới, chỉ tốn chỗ.
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cleanAssetsDir()],
  build: {
    outDir: '../wwwroot',
    emptyOutDir: false, // Do not delete wwwroot/uploads directory
    // Mặc định Vite chèn <link rel="modulepreload"> cho cả các chunk chỉ được
    // import động, nên trình duyệt vẫn tải three/r3f ngay khi vào trang và
    // React.lazy chỉ hoãn được việc thực thi chứ không tiết kiệm băng thông.
    // Loại chúng khỏi preload để chỉ tải khi người dùng cuộn tới khu vực 3D.
    modulePreload: {
      resolveDependencies(_url, deps) {
        return deps.filter((dep) => !/(^|\/)(r3f|three)-[\w-]*\.js$/.test(dep))
      },
    },
    rollupOptions: {
      output: {
        // KHÔNG tự gom three/@react-three vào một chunk. Ép nhóm như vậy khiến
        // cả chunk trở thành phụ thuộc TĨNH của entry ngay khi một module bất kỳ
        // trong nhóm cũng nằm trên nhánh eager — kết quả là 250 KB three vẫn tải
        // ngay lúc vào trang dù Grid3D đã dùng React.lazy.
        // Để Rolldown tự tách theo ranh giới import() thì ranh giới mới đúng.
        // Chỉ gom `motion` vì nó vốn đã nằm trên nhánh eager (App.tsx dùng trực tiếp).
        manualChunks(id) {
          const path = id.replace(/\\/g, '/');
          if (!path.includes('/node_modules/')) return;
          if (/\/node_modules\/(motion|motion-dom|motion-utils|framer-motion)\//.test(path)) {
            return 'motion';
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5062',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5062',
        changeOrigin: true,
      }
    }
  }
})
