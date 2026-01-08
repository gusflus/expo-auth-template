// Cognito Custom Message trigger to customize verification / reset emails
export const handler = async (event: any) => {
  try {
    const trigger = event.triggerSource;
    const code = event.request?.codeParameter;
    const username =
      event.userName || event.request?.userAttributes?.email || "";

    // Signup / Resend code flows
    if (
      trigger === "CustomMessage_SignUp" ||
      trigger === "CustomMessage_ResendCode"
    ) {
      event.response.emailSubject = "Confirm your account";
      event.response.emailMessage = `Hello ${username},\n\nThanks for signing up — your verification code is:\n\n${code}\n\nIf you didn't request this, you can safely ignore this email.\n\n— The Team`;
      event.response.smsMessage = `Your verification code is ${code}`;
    }

    // Forgot password flow
    if (trigger === "CustomMessage_ForgotPassword") {
      event.response.emailSubject = "Reset your password";
      event.response.emailMessage = `Hello ${username},\n\nUse the following code to reset your password:\n\n${code}\n\nIf you didn't request a password reset, please contact support.\n\n— The Team`;
      event.response.smsMessage = `Your password reset code is ${code}`;
    }

    // Admin create user (optional)
    if (trigger === "CustomMessage_AdminCreateUser") {
      const tempPassword =
        event.request?.temporaryPassword ||
        event.request?.passwordParameter ||
        "";
      event.response.emailSubject = "Your account has been created";
      event.response.emailMessage = `Hello ${username},\n\nAn account has been created for you. Temporary password:\n\n${tempPassword}\n\nPlease sign in and change your password.\n\n— The Team`;
    }

    return event;
  } catch (err) {
    console.warn("custom-message error", err);
    return event;
  }
};
