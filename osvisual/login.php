<?php include('server.php') ?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Login | SCHEDULIX</title>
  <link rel="stylesheet" type="text/css" href="stylelogin2.css">
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
  <script>
    function validateLoginForm() {
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value.trim();

      if(username === "") {
        alert("Username cannot be empty!");
        return false;
      }

      if(password === "") {
        alert("Password cannot be empty!");
        return false;
      }

      if(password.length < 6) {
        alert("Password must be at least 6 characters long!");
        return false;
      }

      return true; // form is valid
    }
  </script>
</head>
<body>
  <div class="background-overlay"></div>

  <div class="container">
    <div class="login-box">
      <h2>Login</h2>
      <p class="subtitle">System Access Portal</p>

      <form method="post" action="login.php" onsubmit="return validateLoginForm()">
        <?php include('errors.php'); ?>
        <div class="input-group">
          <label for="username">Username</label>
          <input type="text" name="username" id="username" placeholder="Enter your username" required>
        </div>
        <div class="input-group">
          <label for="password">Password</label>
          <input type="password" name="password" id="password" placeholder="Enter your password" required>
        </div>
        <button type="submit" class="btn" name="login_user">Login</button>
        <p class="signup-link">
          Not yet a member? <a href="register.php">Create an Account</a>
        </p>
      </form>
    </div>
  </div>
</body>
</html>
