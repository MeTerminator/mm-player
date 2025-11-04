

export const getLocalStorageItem = (key) => {
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


