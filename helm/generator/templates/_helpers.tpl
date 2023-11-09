{{/*
Expand the name of the chart.
*/}}
{{- define "load-generator.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "load-generator.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "load-generator.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "load-generator.serverLabels" -}}
helm.sh/chart: {{ include "load-generator.chart" . }}
{{ include "load-generator.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "load-generator.labels" -}}
helm.sh/chart: {{ include "load-generator.chart" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "load-generator.selectorLabels" -}}
app.kubernetes.io/name: {{ include "load-generator.name" . }}-server
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "load-generator.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "load-generator.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "load-generator.remoteName" -}}
{{- if .Values.remote -}}
http://{{ .Values.remote }}/
{{- else -}}
http://{{ include "load-generator.fullname" . }}-server:{{ .Values.service.port }}
{{- end -}}
{{- end }}


{{ define "load-generator.remoteArgs" }}
"--remote", "{{ include "load-generator.remoteName" . }}",
{{ end }}

{{ define "load-generator.generatorArgs" }}
"-v", "-v", "generate",
{{- with (required "load parameters should be configured" .Values.generator.load) -}}
"{{ .name }}",{{ range .args }} "{{ . }}",{{ end }}
{{- end }}
{{- include "load-generator.remoteArgs" . }}
{{ end }}

{{/* Generate transactions job */}}
{{ define "load-generator.sendJobSpec" }}
template:
  metadata:
    {{- with .Values.podAnnotations }}
    annotations:
      {{- toYaml . | nindent 8 }}
    {{- end }}
    labels:
      {{- include "load-generator.labels" . | nindent 8 }}
      {{- with .Values.podLabels }}
      {{- toYaml . | nindent 8 }}
      {{- end }}
  spec:
    restartPolicy: OnFailure
    backoffLimit: 1024
    containers:
      - name: main
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        args: [
          "-v", "-v", "send",
          {{ include "load-generator.remoteArgs" . | indent 10 }}
          {{ include "load-generator.sendArgs" . | indent 10 }}
        ]
{{ end }}

{{ define "load-generator.sendArgs" }}
{{ with .Values.send }}
{{ with .duration }}
"--duration", "{{ . }}",
{{ end }}
{{ with .period }}
"--period", "{{ . }}",
{{ end }}
{{ with .packSize }}
"--pack-size", "{{ . }}",
{{ end }}
{{ with .count }}
"--count", "{{ . }}",
{{ end }}
{{- if .rotateAccounts }}
"--rotate-keys",
{{- end }}
{{- if .rotateNodes }}
"--rotate-nodes",
{{- end }}
{{ end }}
{{ end }}
