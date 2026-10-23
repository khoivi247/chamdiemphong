const fs = require("fs");
const path = require("path");

const root = __dirname;
const output = path.join(root, "public");
const requiredFiles = ["Index.html", "style.css", "script.js"];

requiredFiles.forEach(function(file) {
  if (!fs.existsSync(path.join(root, file))) {
    throw new Error("Missing required source file: " + file);
  }
});

let html = fs.readFileSync(path.join(root, "Index.html"), "utf8");
html = html.replace(
  "<?!= include('Styles'); ?>",
  '<link rel="stylesheet" href="/style.css">'
).replace(
  "<?!= include('Scripts'); ?>",
  '<script src="/script.js" defer></script>'
);
if (html.includes("<?!=")) {
  throw new Error("Index.html contains an Apps Script template that was not converted.");
}

fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "index.html"), html, "utf8");
fs.copyFileSync(path.join(root, "style.css"), path.join(output, "style.css"));
fs.copyFileSync(path.join(root, "script.js"), path.join(output, "script.js"));
console.log("Built Vercel frontend in " + output);
