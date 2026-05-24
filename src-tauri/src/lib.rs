use std::process::Command;

fn run_command(cmd: &str, args: &[&str]) -> Result<(), String> {
    let output = Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("执行失败: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = if !stderr.is_empty() {
            stderr
        } else {
            stdout
        };
        Err(format!("命令执行失败: {}", msg))
    }
}

fn schedule_task(name: &str, command: &str, seconds: u64) -> Result<(), String> {
    let ps_script = format!(
        "$t = (Get-Date).AddSeconds({}); schtasks /create /tn '{}' /tr '{}' /sc once /st $t.ToString('HH:mm:ss') /sd $t.ToString('MM/dd/yyyy') /f",
        seconds, name, command
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
        .output()
        .map_err(|e| format!("创建计划任务失败: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "创建计划任务失败: {}{}",
            stdout, stderr
        ))
    }
}

#[tauri::command]
fn schedule_power(action: String, seconds: u64) -> Result<String, String> {
    let label = match action.as_str() {
        "shutdown" => "关机",
        "restart" => "重启",
        "hibernate" => "休眠",
        "sleep" => "睡眠",
        _ => return Err(format!("未知操作: {}", action)),
    };

    match action.as_str() {
        "shutdown" | "restart" => {
            let flag = if action == "shutdown" {
                "/s"
            } else {
                "/r"
            };
            let secs_str = seconds.to_string();
            run_command("shutdown", &[flag, "/t", &secs_str])?;
        }
        "hibernate" => {
            if seconds == 0 {
                run_command("shutdown", &["/h"])?;
            } else {
                schedule_task("WinPilot_Hibernate", "shutdown /h", seconds)?;
            }
        }
        "sleep" => {
            if seconds == 0 {
                run_command("rundll32.exe", &["powrprof.dll,SetSuspendState", "0,1,0"])?;
            } else {
                schedule_task(
                    "WinPilot_Sleep",
                    "rundll32.exe powrprof.dll,SetSuspendState 0,1,0",
                    seconds,
                )?;
            }
        }
        _ => return Err(format!("未知操作: {}", action)),
    }

    if seconds == 0 {
        Ok(format!("已立即执行{}", label))
    } else {
        Ok(format!("已计划{}秒后{}", seconds, label))
    }
}

#[tauri::command]
fn cancel_power() -> Result<String, String> {
    // Cancel shutdown/restart timer
    let shutdown_result = Command::new("shutdown").args(["/a"]).output();
    let shutdown_cancelled = shutdown_result.map(|o| o.status.success()).unwrap_or(false);

    // Remove scheduled tasks for hibernate/sleep
    let hibernate_removed = Command::new("schtasks")
        .args(["/delete", "/tn", "WinPilot_Hibernate", "/f"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let sleep_removed = Command::new("schtasks")
        .args(["/delete", "/tn", "WinPilot_Sleep", "/f"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if shutdown_cancelled || hibernate_removed || sleep_removed {
        Ok("已取消定时操作".to_string())
    } else {
        Err("没有正在进行的定时操作".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![schedule_power, cancel_power])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
