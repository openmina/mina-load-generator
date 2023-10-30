{{/* Generate transactions job */}}
{{ define "runner.jobSpec" }}
template:
  spec:
    restartPolicy: Never
    containers:
      - name: main
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        args: [
          "-v", "-v", "run",
          {{ include "runner.loadArgs" . | indent 10 }}
          {{ include "runner.networkArgs" . | indent 10 }}
          {{ include "runner.sendArgs" . | indent 10 }}
        ]
{{ end }}

{{ define "runner.loadArgs" }}
"{{ .Values.load.name }}",{{ range .Values.load.args }} "{{ . }}",{{ end }}
{{ end }}

{{ define "runner.networkArgs" }}
"--nodes",{{ range .Values.network.nodes }} "{{ . }}",{{ end }}
{{- if .Values.network.rotateNodes }}
"--rotate-nodes",
{{- end }}
"--keys",{{ range .Values.network.senders }} "{{ . }}",{{ end }}
{{- if .Values.network.rotateSenders }}
"--rotate-keys",
{{- end -}}
{{ end }}

{{ define "runner.sendArgs" }}
{{ with .Values.send }}
"--duration", "{{ .duration }}",
"--period", "{{ .period }}",
"--pack-size", "{{ .packSize }}",
{{- if .wait }}"--wait"{{ else }}"--no-wait"{{ end }},
{{ end }}
{{ end }}
