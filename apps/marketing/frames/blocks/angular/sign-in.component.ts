import { Component, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuiButton } from '@absoluteui/angular/button';
import { AuiForm } from '@absoluteui/angular/form';
import { AuiOtpInput } from '@absoluteui/angular/otp-input';
import { AuiPasswordInput } from '@absoluteui/angular/password-input';
import { AuiTextInput } from '@absoluteui/angular/text-input';

@Component({
  selector: 'app-sign-in',
  imports: [ReactiveFormsModule, AuiForm, AuiTextInput, AuiPasswordInput, AuiOtpInput, AuiButton],
  template: `
    @if (step() === 'password') {
      <form auiForm [formGroup]="credentials" focusOnInvalid="summary" (submitted)="continue()">
        <h1>Sign in</h1>
        <aui-text-input label="Work email" type="email" name="email" autocomplete="username" [required]="true" formControlName="email" />
        <aui-password-input label="Password" name="password" autocomplete="current-password" [required]="true" [capsLockWarning]="true" formControlName="password" />
        <button type="submit" auiButton variant="primary">Continue</button>
      </form>
    } @else {
      <form auiForm [formGroup]="verification" focusOnInvalid="summary" (submitted)="verify()">
        <h1>Enter your code</h1>
        <aui-otp-input label="One-time code" name="code" [length]="6" [required]="true" description="Enter the six-digit code from your authenticator app." formControlName="code" (completed)="verify()" />
        <button type="submit" auiButton variant="primary">Verify</button>
      </form>
    }
  `,
})
export class SignInComponent {
  readonly step = signal<'password' | 'code'>('password');
  readonly credentials = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly verification = new FormGroup({
    code: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(6)] }),
  });

  continue(): void {
    // Send the credentials to your server; on success it asks for the one-time code.
    this.step.set('code');
  }

  verify(): void {
    // Send this.verification.value.code to your server.
  }
}
