F5 Voice Clone Service
 1.0.0 
OAS 3.1
/openapi.json
system


GET
/api/v1/health
Health


GET
/api/v1/status
Status

env


GET
/api/v1/env/status
Env Status


POST
/api/v1/env/install
Env Install

f5-tts


POST
/api/v1/models/download
Model Download


GET
/api/v1/voices
Voices


GET
/api/v1/samples
Samples


POST
/api/v1/generate
Generate Voice


GET
/api/v1/generate/stream/{task_id}
Generate Stream


GET
/api/v1/generate/download/{task_id}
Generate Download

files


GET
/api/v1/files/{file_id}
Download


Schemas
HTTPValidationErrorExpand allobject
ValidationErrorExpand allobject
---------------------------------------
---------------------------------------
---------------------------------------
---------------------------------------
---------------------------------------
VieNeu TTS Service
 1.0.0 
OAS 3.1
/openapi.json
system


GET
/api/v1/health
Health


GET
/api/v1/status
Status

env


GET
/api/v1/env/status
Env Status


POST
/api/v1/env/install
Env Install

vieneu-tts


GET
/api/v1/voices
Tts Voices


GET
/api/v1/models/configs
Tts Model Configs


POST
/api/v1/models/download
Tts Model Download


POST
/api/v1/models/load
Tts Model Load


POST
/api/v1/models/unload
Tts Model Unload


POST
/api/v1/generate
Tts Generate Route


GET
/api/v1/generate/stream/{task_id}
Tts Progress Stream


GET
/api/v1/generate/download/{task_id}
Tts Download

files


GET
/api/v1/files/{file_id}
Download


Schemas
HTTPValidationErrorExpand allobject
ValidationErrorExpand allobject
---------------------------------------
---------------------------------------
---------------------------------------
---------------------------------------
---------------------------------------
PSI App Service
 1.0.0 
OAS 3.1
/openapi.json
system


GET
/api/v1/health
Health


GET
/api/v1/status
Status


GET
/api/v1/logs/tail
Logs Tail


GET
/api/v1/logs/stream
Logs Stream


DELETE
/api/v1/cache/temp
Cache Clear

media


POST
/api/v1/video/download
Video Download


GET
/api/v1/video/download/stream/{job_id}
Video Download Stream


GET
/api/v1/video/download/status/{job_id}
Video Download Status


POST
/api/v1/video/trim
Video Trim


POST
/api/v1/video/extract-audio
Video Extract Audio


POST
/api/v1/audio/convert
Audio Convert


POST
/api/v1/video/speed
Video Speed

files


GET
/api/v1/files/{file_id}
Download

tools


GET
/api/v1/tools/status
Tools Status


POST
/api/v1/tools/install
Tools Install

env


GET
/api/v1/env/status
Env Status


POST
/api/v1/env/install
Env Install


Schemas
Body_video_extract_audio_api_v1_video_extract_audio_postExpand allobject
Body_video_trim_api_v1_video_trim_postExpand allobject
HTTPValidationErrorExpand allobject
ValidationErrorExpand allobject
---------------------------------------
---------------------------------------
---------------------------------------
---------------------------------------
---------------------------------------
Whisper STT Service
 1.0.0 
OAS 3.1
/openapi.json
system


GET
/api/v1/health
Health


GET
/api/v1/status
Status

env


GET
/api/v1/env/status
Env Status


POST
/api/v1/env/install
Env Install

stt


POST
/api/v1/models/download
Stt Model Download


POST
/api/v1/transcribe
Stt Transcribe Route


GET
/api/v1/transcribe/stream/{task_id}
Stt Progress Stream


GET
/api/v1/transcribe/result/{task_id}
Stt Result


Schemas
Body_stt_transcribe_route_api_v1_transcribe_postExpand allobject
HTTPValidationErrorExpand allobject
ValidationErrorExpand allobject
---------------------------------------
---------------------------------------
---------------------------------------
---------------------------------------
---------------------------------------
Background Removal Service
 1.0.0 
OAS 3.1
/openapi.json
system


GET
/api/v1/health
Health


GET
/api/v1/status
Status

env


GET
/api/v1/env/status
Env Status


POST
/api/v1/env/install
Env Install

bg-remove-overlay


POST
/api/v1/remove/upload
Remove Background Upload


POST
/api/v1/remove/url
Remove Background Url


GET
/api/v1/remove/stream/{task_id}
Remove Progress Stream


GET
/api/v1/remove/result/{task_id}
Remove Result

files


GET
/api/v1/files/{file_id}
Download


Schemas
HTTPValidationErrorExpand allobject
ValidationErrorExpand allobject
