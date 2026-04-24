# 后端API测试脚本

# 1. 登录获取token
$loginResponse = Invoke-RestMethod -Uri http://localhost:3001/api/v1/auth/login -Method POST -Body @{
    emailOrUsername = "admin"
    password = "admin123"
} | ConvertTo-Json | ConvertFrom-Json

Write-Host "`n1. 登录API测试" -ForegroundColor Green
Write-Host "响应:" ($loginResponse | ConvertTo-Json -Depth 3)

$token = $loginResponse.data.tokens.accessToken
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# 2. 获取当前用户信息
Write-Host "`n2. 获取当前用户信息API测试" -ForegroundColor Green
try {
    $currentUserResponse = Invoke-RestMethod -Uri http://localhost:3001/api/v1/auth/current-user -Headers $headers
    Write-Host "响应:" ($currentUserResponse | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "错误:" $_.ErrorDetails
}

# 3. 获取用户列表
Write-Host "`n3. 获取用户列表API测试" -ForegroundColor Green
try {
    $usersResponse = Invoke-RestMethod -Uri http://localhost:3001/api/v1/users?page=1&limit=10 -Headers $headers
    Write-Host "响应:" ($usersResponse | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "错误:" $_.ErrorDetails
}

# 4. 创建项目
Write-Host "`n4. 创建项目API测试" -ForegroundColor Green
try {
    $createProjectResponse = Invoke-RestMethod -Uri http://localhost:3001/api/v1/projects -Method POST -Headers $headers -Body @{
        name = "API测试项目"
        description = "这是一个通过API测试创建的项目"
        visibility = "private"
        priority = "high"
        tags = @("test", "api")
    } | ConvertTo-Json | ConvertFrom-Json
    Write-Host "响应:" ($createProjectResponse | ConvertTo-Json -Depth 3)

    $projectId = $createProjectResponse.data.id
} catch {
    Write-Host "错误:" $_.ErrorDetails
}

# 5. 获取项目列表
Write-Host "`n5. 获取项目列表API测试" -ForegroundColor Green
try {
    $projectsResponse = Invoke-RestMethod -Uri http://localhost:3001/api/v1/projects -Headers $headers
    Write-Host "响应:" ($projectsResponse | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "错误:" $_.ErrorDetails
}

# 6. 获取项目详情
if ($projectId) {
    Write-Host "`n6. 获取项目详情API测试" -ForegroundColor Green
    try {
        $projectDetailResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/projects/$projectId" -Headers $headers
        Write-Host "响应:" ($projectDetailResponse | ConvertTo-Json -Depth 3)
    } catch {
        Write-Host "错误:" $_.ErrorDetails
    }

    # 7. 更新项目
    Write-Host "`n7. 更新项目API测试" -ForegroundColor Green
    try {
        $updateProjectResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/projects/$projectId" -Method PUT -Headers $headers -Body @{
            description = "项目描述已更新 - " + (Get-Date).ToString()
        } | ConvertTo-Json | ConvertFrom-Json
        Write-Host "响应:" ($updateProjectResponse | ConvertTo-Json -Depth 3)
    } catch {
        Write-Host "错误:" $_.ErrorDetails
    }

    # 8. 获取项目成员列表
    Write-Host "`n8. 获取项目成员列表API测试" -ForegroundColor Green
    try {
        $membersResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/projects/$projectId/members" -Headers $headers
        Write-Host "响应:" ($membersResponse | ConvertTo-Json -Depth 3)
    } catch {
        Write-Host "错误:" $_.ErrorDetails
    }
}

# 9. 创建连接
Write-Host "`n9. 创建连接API测试" -ForegroundColor Green
try {
    $createConnectionResponse = Invoke-RestMethod -Uri http://localhost:3001/api/v1/connections -Method POST -Headers $headers -Body @{
        name = "测试数据库连接"
        type = "mysql"
        config = @{
            host = "localhost"
            port = 3306
            database = "test_db"
            username = "root"
            password = "password"
        }
    } | ConvertTo-Json | ConvertFrom-Json
    Write-Host "响应:" ($createConnectionResponse | ConvertTo-Json -Depth 3)

    $connectionId = $createConnectionResponse.data.id
} catch {
    Write-Host "错误:" $_.ErrorDetails
}

# 10. 获取连接列表
Write-Host "`n10. 获取连接列表API测试" -ForegroundColor Green
try {
    $connectionsResponse = Invoke-RestMethod -Uri http://localhost:3001/api/v1/connections -Headers $headers
    Write-Host "响应:" ($connectionsResponse | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "错误:" $_.ErrorDetails
}

# 11. 测试连接
if ($connectionId) {
    Write-Host "`n11. 测试连接API测试" -ForegroundColor Green
    try {
        $testConnectionResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/connections/$connectionId/test" -Method POST -Headers $headers
        Write-Host "响应:" ($testConnectionResponse | ConvertTo-Json -Depth 3)
    } catch {
        Write-Host "错误:" $_.ErrorDetails
    }
}

# 12. 获取项目统计
Write-Host "`n12. 获取项目统计API测试" -ForegroundColor Green
try {
    $statsResponse = Invoke-RestMethod -Uri http://localhost:3001/api/v1/projects/stats -Headers $headers
    Write-Host "响应:" ($statsResponse | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "错误:" $_.ErrorDetails
}

# 13. 用户注册测试（应该返回错误，因为admin已存在）
Write-Host "`n13. 用户注册API测试（重复注册）" -ForegroundColor Green
try {
    $registerResponse = Invoke-RestMethod -Uri http://localhost:3001/api/v1/auth/register -Method POST -Body @{
        username = "admin"
        email = "admin@example.com"
        password = "admin123"
        firstName = "Admin"
        lastName = "User"
    } | ConvertTo-Json | ConvertFrom-Json
    Write-Host "响应:" ($registerResponse | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "错误（预期）:" $_.ErrorDetails
}

# 14. 错误处理测试 - 无效的token
Write-Host "`n14. 错误处理测试 - 无效token" -ForegroundColor Green
try {
    $invalidHeaders = @{
        "Authorization" = "Bearer invalid_token"
        "Content-Type" = "application/json"
    }
    $errorResponse = Invoke-RestMethod -Uri http://localhost:3001/api/v1/users -Headers $invalidHeaders
    Write-Host "响应:" ($errorResponse | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "错误（预期）:" $_.ErrorDetails
}

Write-Host "`n========== 测试完成 ==========" -ForegroundColor Cyan