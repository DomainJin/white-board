# PostgreSQL Setup Script for Whiteboard App

$pgPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$passwords = @("postgres", "password", "admin", "")

Write-Host "🔄 Attempting to create whiteboard database..."

foreach ($pass in $passwords) {
    try {
        if ($pass -eq "") {
            Write-Host "Trying no password..."
            & $pgPath -U postgres -h localhost -c "CREATE USER IF NOT EXISTS whiteboard WITH PASSWORD 'whiteboard';" 2>&1
        } else {
            Write-Host "Trying password: $pass"
            $env:PGPASSWORD = $pass
            & $pgPath -U postgres -h localhost -c "CREATE USER IF NOT EXISTS whiteboard WITH PASSWORD 'whiteboard';" 2>&1
            $env:PGPASSWORD = ""
        }
        
        Write-Host "✅ User created successfully!"
        
        # Create database
        $env:PGPASSWORD = $pass
        & $pgPath -U postgres -h localhost -c "CREATE DATABASE IF NOT EXISTS whiteboard OWNER whiteboard;" 2>&1
        $env:PGPASSWORD = ""
        
        Write-Host "✅ Database created successfully!"
        Write-Host "✅ Setup complete! Run 'npm run dev' in the server folder"
        break
        
    } catch {
        Write-Host "❌ Failed with password: $pass"
    }
}
