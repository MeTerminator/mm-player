

const getLocalStorageItem = (key) => {
  // 检查是否在浏览器环境，防止 SSR 报错
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error("Error reading localStorage:", error);
    return null;
  }
};

export const getSessionId = () => {
    // 1. 尝试从 URL 读取 (?sid=xxxx)
    if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const urlSid = params.get('sid');
        if (urlSid) {
            console.log("SID loaded from URL:", urlSid);
            // 可选：如果 URL 有更新，同步存入 LocalStorage 方便下次使用
            localStorage.setItem('sid', urlSid);
            return urlSid;
        }
    }

    // 2. 尝试从 Local Storage 读取
    const localSid = getLocalStorageItem('sid');
    if (localSid) {
        console.log("SID loaded from LocalStorage:", localSid);
        return localSid;
    }

    return "";
};
