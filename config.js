/* 云同步配置（可选，默认关闭 —— 纯本地使用即可）
   学习数据默认只存在本机浏览器 + 你指定的本地备份文件里，不上传任何服务器。
   想多设备同步时，在网页「统计 → 云同步」里粘贴 GitHub 令牌即可（只勾 gist 权限），
   不填就完全离线使用，功能不受影响。

   默认后端：GitHub Gist（存档仅自己可见）。
   若要改用 LeanCloud，把 mode 改成 'leancloud' 并填 appId / appKey 即可。 */
window.SYNC_CONFIG = {
  githubToken: '',     // 网页内配置后保存在本机，这里留空
  appId: '',           // LeanCloud 模式才需要
  appKey: '',
  apiServer: ''        // LeanCloud 自定义 API 域名才需要
};
