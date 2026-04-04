<?php $file_path = "/srv/www/bonsai.so/current/web/app/plugins/jackalopes-server/includes/class-websocket-server.php"; $content = file_get_contents($file_path); $fixed_content = str_replace("}
PHP;", "PHP;", $content); file_put_contents($file_path, $fixed_content); echo "File fixed!
";
