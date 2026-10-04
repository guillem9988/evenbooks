export const THEME_KEY = "matchinvoice-theme";

/** Runs in <head> before hydration so the first paint already has the right theme. Kept tiny and dependency-free. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=p==="dark"||((p===null||p==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
