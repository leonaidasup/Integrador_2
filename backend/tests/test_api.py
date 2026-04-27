from __future__ import annotations

import base64


def test_health_ok(client) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["model_loaded"] is False
    assert payload["classes"] == ["background", "few-layer", "bulk"]


def test_load_model_success(client) -> None:
    response = client.post(
        "/load_model",
        files={"file": ("model.pth", b"fake", "application/octet-stream")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["model_loaded"] is True
    assert payload["framework"] == "pytorch"


def test_load_model_invalid_extension(client) -> None:
    response = client.post(
        "/load_model",
        files={"file": ("model.txt", b"fake", "text/plain")},
    )

    assert response.status_code == 400


def test_segment_no_model_loaded(client, image_bytes) -> None:
    response = client.post(
        "/segment",
        files={"file": ("image.png", image_bytes, "image/png")},
    )

    assert response.status_code == 503
    assert "model" in response.json().get("detail", "").lower()


def test_segment_success(client, image_bytes) -> None:
    client.post(
        "/load_model",
        files={"file": ("model.pth", b"fake", "application/octet-stream")},
    )

    response = client.post(
        "/segment",
        files={"file": ("image.png", image_bytes, "image/png")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["model_loaded"] is True
    assert payload["mask_base64"]
    assert payload["segmented_base64"]
    base64.b64decode(payload["mask_base64"])
    base64.b64decode(payload["segmented_base64"])
