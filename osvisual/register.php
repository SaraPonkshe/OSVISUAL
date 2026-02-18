<?php include('server.php') ?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Register | SCHEDULIX</title>
  <link rel="stylesheet" type="text/css" href="registerstyle.css">
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
  <script>
    function validateRegisterForm() {
      const username = document.forms["registerForm"]["username"].value.trim();
      const email = document.forms["registerForm"]["email"].value.trim();
      const password1 = document.forms["registerForm"]["password_1"].value;
      const password2 = document.forms["registerForm"]["password_2"].value;

      if (username === "") {
        alert("Username cannot be empty!");
        return false;
      }

      if (email === "") {
        alert("Email cannot be empty!");
        return false;
      }

      // Simple email pattern
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        alert("Please enter a valid email address!");
        return false;
      }

      if (password1.length < 6) {
        alert("Password must be at least 6 characters long!");
        return false;
      }

      if (password1 !== password2) {
        alert("Passwords do not match!");
        return false;
      }

      return true; // form is valid
    }
  </script>
</head>
<body>
  <div class="background-overlay"></div>

  <div class="container">
    <div class="signup-box">
      <h2>Register</h2>
      <p class="subtitle">Create your system account</p>

      <form name="registerForm" method="post" action="register.php" onsubmit="return validateRegisterForm()">
        <?php include('errors.php'); ?>

        <div class="input-group">
          <label>Username</label>
          <input type="text" name="username" value="<?php echo $username; ?>" required>
        </div>

        <div class="input-group">
          <label>Email</label>
          <input type="email" name="email" value="<?php echo $email; ?>" required>
        </div>

        <div class="input-group">
          <label>Password</label>
          <input type="password" name="password_1" required>
        </div>

        <div class="input-group">
          <label>Confirm Password</label>
          <input type="password" name="password_2" required>
        </div>

        <div class="input-group">
          <button type="submit" class="btn" name="reg_user">Register</button>
        </div>

        <p class="signup-link">
          Already a member? <a href="login.php">Sign in</a>
        </p>
      </form>
    </div>
  </div>
</body>
</html>
