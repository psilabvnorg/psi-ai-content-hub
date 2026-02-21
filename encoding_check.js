const fs=require('fs'); const b=fs.readFileSync('electron/main.cjs'); console.log(b[0],b[1],b[2]); console.log(b.slice(0,32).toString('utf8')); 
