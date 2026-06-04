# google/veo3.1/text-to-video

> Generate high-fidelity videos from text prompts with Google’s most advanced generative video model. Veo 3.1 delivers cinematic quality, dynamic camera motion, and lifelike detail for storytelling and creative production.


## Overview

- **Endpoint**: `https://api.atlascloud.ai/api/v1/model/generateVideo`
- **Model ID**: `google/veo3.1/text-to-video`


## API Information

This model can be used via our HTTP API or more conveniently via our client libraries.
See the input and output schema below, as well as the usage examples.


### Input Schema

The API accepts the following input parameters:

- **`model`** (`string`, _required_):
  model name
  - Default: `"google/veo3.1/text-to-video"`

- **`prompt`** (`string`, _required_):
  Text prompt for generation; Positive text prompt.

- **`aspect_ratio`** (`string`, _optional_):
  Aspect ratio of the video.
  - Default: `"16:9"`
  - Options: "16:9", "9:16"

- **`duration`** (`integer`, _optional_):
  The duration of the generated media in seconds.
  - Default: `8`
  - Options: 8, 4, 6

- **`resolution`** (`string`, _optional_):
  Video resolution.
  - Default: `"720p"`
  - Options: "720p", "1080p", "4k"

- **`generate_audio`** (`boolean`, _optional_):
  Whether to generate audio.
  - Default: `false`

- **`negative_prompt`** (`string`, _optional_):
  Negative prompt for the generation.

- **`seed`** (`integer`, _optional_):
  The random seed to use for the generation.



**Required Parameters Example**:

```json
{
  "model": "google/veo3.1/text-to-video",
  "prompt": ""
}
```


**Full Example**:

```json
{
  "model": "google/veo3.1/text-to-video",
  "prompt": "",
  "aspect_ratio": "16:9",
  "duration": 8,
  "resolution": "720p",
  "generate_audio": false,
  "negative_prompt": "",
  "seed": 0
}
```


### Output Schema

The API returns the following output format:


- **`created_at`** (`string`, _optional_):
  ISO timestamp of when the request was created (e.g., “2023-04-01T12:34:56.789Z”).

- **`has_nsfw_contents`** (`array[boolean]`, _optional_):
  Array of boolean values indicating NSFW detection for each output.

- **`id`** (`string`, _optional_):
  Unique identifier for the prediction, the ID of the prediction to get.

- **`model`** (`string`, _optional_):
  Model ID used for the prediction.

- **`outputs`** (`array[string]`, _optional_):
  Array of URLs to the generated content (empty when status is not completed).

- **`status`** (`string`, _optional_):
  Status of the task: created, processing, completed, or failed.

- **`urls`** (`object`, _optional_):
  Object containing related API endpoints.



**Example Response**:

```json
{
  "created_at": "",
  "has_nsfw_contents": [],
  "id": "",
  "model": "",
  "outputs": [
    ""
  ],
  "status": "",
  "urls": {}
}
```


## Usage Examples

### cURL

```bash
# Step 1: Start generation
curl -X POST "https://api.atlascloud.ai/api/v1/model/generateVideo" \
  -H "Authorization: Bearer $ATLASCLOUD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "google/veo3.1/text-to-video",
  "prompt": "",
  "aspect_ratio": "16:9",
  "duration": 8,
  "resolution": "720p",
  "generate_audio": false,
  "negative_prompt": "",
  "seed": 0
}'

# Response will contain: {"code": 200, "data": {"id": "prediction_id"}}

# Step 2: Poll for result (replace {prediction_id} with actual ID)
curl -X GET "https://api.atlascloud.ai/api/v1/model/result/{request_id}" \
  -H "Authorization: Bearer $ATLASCLOUD_API_KEY"

# Keep polling until status is "completed", "succeeded" or "failed"
# When completed, outputs will contain the generated content URL(s)
```

## Additional Resources

### Documentation

- [Model Playground](https://www.atlascloud.ai/models/google/veo3.1/text-to-video)
