export async function generateDeploymentScript(config) {
  try {
    let miscScript = '';
    if ('miscVersion' in config) {
      miscScript = `<script src="${CLOUDFRONT_URL}/scripts/${templateName}-misc/${versionName}.js" type='text/javascript'></script>`
    }
    const wizardVersion = 'wizardVersion' in config ? versionName : '';
    const blob = `
        ${miscScript}
        ${config.beforeScripts || ''}
        <script type='text/javascript'>
          function loadScript(url, env) {return new Promise(function(resolve, reject) {var script = document.createElement('script'); document.body.appendChild(script); if (env === 'development') script.type = 'module'; script.onload = resolve; script.onerror = reject; script.async = false; script.src = url;});}
          campaign.on('campaign-loaded', function() {
            campaign.disableAutoLock()
            var getQueryParams = function() {
              return new Promise(function(resolve, reject) {
                if (campaign.app().mode !== 'live') {
                  window.SSTEMPLATE.getBuilderQueryParams().then((queryParams) => {
                    resolve(queryParams)
                  })
                } else {
                  resolve(campaign.queryParamsGet())
                }
              })
            }
            getQueryParams().then(queryParams => {
              var isDev = queryParams.dev && queryParams.dev === '1'
              var scriptLoaderDev = queryParams.scriptLoaderDev && queryParams.scriptLoaderDev === '1'
              var url = scriptLoaderDev ? 'https://ss-script-loader.shortstack.local/main.js' : 'https://d1m2uzvk8r2fcn.cloudfront.net/scripts/ss-script-loader/${config.scriptLoaderVersion}.js'
              var env = isDev ? 'development' : 'production'
              loadScript(url, env).then(function() {
                try {
                  window.ssTL({
                    name: '${templateName}',
                    campaign: window.campaign,
                    css: ${config.css},
                    env: env,
                    assetsLoadedCallback: function() {
                      ${config.afterCampaignLoaded || ''}
                    },
                    appVersion: '${versionName}',
                    wizardVersion: '${'wizardVersion' in config ? versionName : ''}',
                    scriptVersion: '${config.scriptVersion}',
                    server: '${serverName}',
                  })
                  window.SSTManager.loadAssets()
                } catch(e) {
                  console.log('ss-script-loader Error:', e)
                }
              })
            })
          }, { widget: '%WIDGET%', synchronous: true })
        </script>
        `;
    await fs.writeFile("template-code.html", blob);
    await $`echo ${blob} | pbcopy`;
  } catch (error) {
    console.error('Error generating script blob:', error);
  }
}
