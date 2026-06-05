# deploy.ps1 - Custom deployment script bypassing gh-pages npm clone issues

# 1. Build project
Write-Host "Building project..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}

# 2. Enter dist folder
Write-Host "Entering dist folder..." -ForegroundColor Cyan
Set-Location dist

# 3. Init temporary git repo
Write-Host "Initializing temporary git repo..." -ForegroundColor Cyan
git init
git checkout -B gh-pages
git add .
git commit -m "Deploy to GitHub Pages"

# 4. Push to remote gh-pages branch
Write-Host "Pushing to remote gh-pages branch..." -ForegroundColor Cyan
git push -f git@github.com:Shimmer0007/uscost.git gh-pages

# 5. Clean up git folder in dist
Write-Host "Cleaning up..." -ForegroundColor Cyan
Remove-Item -Recurse -Force .git

# Go back to root
Set-Location ..
Write-Host "Deployed successfully!" -ForegroundColor Green
