const express = require('express');
const path = require('path');

const apkName = 'Warriors-Parent-1.1.apk';
const apkPath = path.join(__dirname, '..', 'downloads', apkName);

module.exports = ({ getFrontendOrigin }) => {
  const router = express.Router();
  const pageDir = path.join(__dirname, '..', 'public', 'parent-download');
  router.use('/parent-download', express.static(pageDir, { maxAge: 0 }));

  router.get('/open-parent', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.vary('User-Agent');
    if (/android/i.test(req.get('user-agent') || '')) {
      return res.sendFile(path.join(pageDir, 'index.html'));
    }
    return res.redirect(302, `${getFrontendOrigin()}/parent/login?source=parent-pwa`);
  });

  router.get(`/downloads/${apkName}`, (req, res, next) => {
    res.type('application/vnd.android.package-archive');
    res.set('Cache-Control', 'public, max-age=3600');
    res.download(apkPath, apkName, (error) => {
      if (error) next(error);
    });
  });

  return router;
};
