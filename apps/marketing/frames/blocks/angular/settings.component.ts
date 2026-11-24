import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuiButton } from '@absoluteui/angular/button';
import { AuiFieldset } from '@absoluteui/angular/fieldset';
import { AuiForm } from '@absoluteui/angular/form';
import { AuiSelect } from '@absoluteui/angular/select';
import { AuiSwitch } from '@absoluteui/angular/switch';
import { AuiTextInput } from '@absoluteui/angular/text-input';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, AuiForm, AuiFieldset, AuiTextInput, AuiSelect, AuiSwitch, AuiButton],
  template: `
    <form auiForm [formGroup]="settings" focusOnInvalid="summary" (submitted)="save()">
      <fieldset auiFieldset legend="Profile" description="Shown to your team.">
        <aui-text-input label="Display name" name="name" autocomplete="name" [required]="true" formControlName="name" />
        <aui-select label="Time zone" name="timezone" [options]="timeZones" formControlName="timezone" />
        <aui-select label="Week starts on" name="weekStart" [options]="weekStarts" formControlName="weekStart" />
      </fieldset>
      <fieldset auiFieldset legend="Notifications" description="Email and in-app.">
        <aui-switch label="Weekly summary" formControlName="summary" />
        <aui-switch label="Approval requests" description="When someone asks you to approve a request" formControlName="approvals" />
      </fieldset>
      <button type="reset" auiButton variant="secondary">Cancel</button>
      <button type="submit" auiButton variant="primary">Save changes</button>
    </form>
  `,
})
export class SettingsComponent {
  readonly timeZones = [
    { value: 'Asia/Kolkata', label: 'India (Asia/Kolkata)' },
    { value: 'Europe/London', label: 'United Kingdom (Europe/London)' },
    { value: 'America/New_York', label: 'US Eastern (America/New_York)' },
  ];
  readonly weekStarts = [
    { value: 'monday', label: 'Monday' },
    { value: 'sunday', label: 'Sunday' },
  ];
  readonly settings = new FormGroup({
    name: new FormControl('Priya Iyer', { nonNullable: true, validators: [Validators.required] }),
    timezone: new FormControl<string | null>('Asia/Kolkata'),
    weekStart: new FormControl<string | null>('monday'),
    summary: new FormControl(true, { nonNullable: true }),
    approvals: new FormControl(true, { nonNullable: true }),
  });

  save(): void {
    // Send this.settings.getRawValue() to your server.
  }
}
