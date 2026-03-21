from __future__ import annotations

import base64
import io

import requests
import streamlit as st
from PIL import Image, UnidentifiedImageError

BACKEND_URL = "http://127.0.0.1:8000/segment"
ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "tif", "tiff"]


def decode_base64_image(value: str) -> Image.Image:
    data = base64.b64decode(value)
    return Image.open(io.BytesIO(data))


def inject_styles() -> None:
    st.markdown(
        """
        <style>
            .stApp {
                background:
                    radial-gradient(circle at 10% 20%, rgba(40, 120, 255, 0.18), transparent 40%),
                    radial-gradient(circle at 90% 10%, rgba(20, 180, 255, 0.12), transparent 35%),
                    linear-gradient(180deg, #02060f 0%, #030b18 100%);
                color: #ecf1fb;
            }
            .hero-card {
                padding: 2rem;
                border-radius: 18px;
                border: 1px solid rgba(81, 138, 255, 0.25);
                background: linear-gradient(145deg, rgba(6,18,35,.95), rgba(4,13,27,.88));
                box-shadow: 0 14px 40px rgba(0, 0, 0, 0.35);
            }
            .drop-card {
                margin-top: 1rem;
                padding: 1.5rem;
                border: 1px dashed rgba(126, 170, 255, 0.35);
                border-radius: 14px;
                background: rgba(5, 13, 24, 0.65);
            }
            .badge {
                display: inline-block;
                margin-right: .4rem;
                margin-top: .4rem;
                padding: .2rem .65rem;
                border-radius: 12px;
                font-size: .75rem;
                border: 1px solid rgba(255,255,255,.15);
                background: rgba(255,255,255,.06);
                color: #d8e6ff;
            }
            h1, h2, h3 {
                letter-spacing: 0.2px;
            }
        </style>
        """,
        unsafe_allow_html=True,
    )


st.set_page_config(page_title="Image Analysis Workspace", layout="wide")
inject_styles()

st.markdown(
    """
    <div class="hero-card">
        <div style="font-size:0.9rem; color:#7cc0ff;">AI Platform</div>
        <h1 style="margin:0.4rem 0 0.2rem 0;">Image Analysis Workspace</h1>
        <p style="margin:0; color:#b8c7e4;">
            Upload microscopy images and run AI segmentation for tissue analysis.
        </p>
    </div>
    """,
    unsafe_allow_html=True,
)

st.markdown('<div class="drop-card">', unsafe_allow_html=True)
st.subheader("Drop your microscopy image here")
st.caption("Upload PNG, TIFF or JPEG images for segmentation.")

uploaded_file = st.file_uploader(
    "Upload image", type=ALLOWED_EXTENSIONS, label_visibility="collapsed"
)

st.markdown(
    '<span class="badge">PNG</span><span class="badge">TIFF</span><span class="badge">JPEG</span><span class="badge">up to 50MB</span>',
    unsafe_allow_html=True,
)

run_btn = st.button("Run Segmentation", type="primary")
st.markdown("</div>", unsafe_allow_html=True)

if uploaded_file is not None:
    try:
        original_img = Image.open(uploaded_file).convert("RGB")
        st.image(original_img, caption="Original image", use_container_width=True)
    except UnidentifiedImageError:
        st.error("Invalid image file. Please upload PNG, JPG, or TIFF.")
        st.stop()

if run_btn:
    if uploaded_file is None:
        st.warning("Please upload an image first.")
        st.stop()

    with st.spinner("Sending image to backend and running inference..."):
        try:
            files = {
                "file": (uploaded_file.name, uploaded_file.getvalue(), uploaded_file.type)
            }
            response = requests.post(BACKEND_URL, files=files, timeout=120)

            if response.status_code != 200:
                detail = response.json().get("detail", response.text)
                st.error(f"Backend error: {detail}")
                st.stop()

            payload = response.json()
            segmented_img = decode_base64_image(payload["segmented_base64"])
            mask_img = decode_base64_image(payload["mask_base64"])

            c1, c2, c3 = st.columns(3)
            with c1:
                st.image(original_img, caption="Original", use_container_width=True)
            with c2:
                st.image(mask_img, caption="Mask (class IDs)", use_container_width=True)
            with c3:
                st.image(segmented_img, caption="Segmented visualization", use_container_width=True)

            st.success(
                f"Segmentation complete. Model loaded: {payload.get('model_loaded', False)}"
            )
            st.write("Classes:", ", ".join(payload.get("classes", [])))

        except requests.RequestException as exc:
            st.error(f"Could not reach backend at {BACKEND_URL}. Error: {exc}")
        except Exception as exc:
            st.error(f"Unexpected error: {exc}")
