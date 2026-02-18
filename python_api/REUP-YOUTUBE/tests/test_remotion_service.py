#!/usr/bin/env python3
"""
Standalone test for Remotion renderer service

This test doesn't depend on pipeline imports, just validates the service class itself.
"""

import sys
import json
import tempfile
from pathlib import Path

# Add remotion_renderer to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src' / 'multilingual_video_pipeline' / 'services'))

# Direct import to avoid pipeline dependencies
from remotion_renderer import RemotionRendererService, RenderConfig, Scene, RenderResult


def test_scene_creation():
    """Test Scene dataclass"""
    print("\n✓ Test 1: Scene Creation")
    scene = Scene(
        image_path='/tmp/image.jpg',
        duration_frames=90,
        transition_type='fade',
        transition_duration_frames=15,
    )
    
    # Verify to_dict
    scene_dict = scene.to_dict()
    assert scene_dict['imagePath'] == '/tmp/image.jpg'
    assert scene_dict['durationFrames'] == 90
    print("  - Scene created and serialized correctly")


def test_render_config_creation():
    """Test RenderConfig dataclass"""
    print("\n✓ Test 2: RenderConfig Creation")
    config = RenderConfig(
        scenes=[
            Scene(image_path='/tmp/img1.jpg', duration_frames=90),
            Scene(image_path='/tmp/img2.jpg', duration_frames=90),
        ],
        audio_path='/tmp/audio.mp3',
        output_path='/tmp/output.mp4',
    )
    
    # Verify to_dict
    config_dict = config.to_dict()
    assert len(config_dict['scenes']) == 2
    assert config_dict['width'] == 1920
    assert config_dict['fps'] == 30
    print("  - RenderConfig created and serialized correctly")


def test_render_result_creation():
    """Test RenderResult dataclass"""
    print("\n✓ Test 3: RenderResult Creation")
    result = RenderResult(
        output_path='/tmp/output.mp4',
        duration_seconds=10.5,
        total_frames=315,
        fps=30,
        file_size_bytes=5242880,  # 5MB
    )
    
    # Verify file_size_mb property
    assert result.file_size_mb == 5.0
    print(f"  - RenderResult created correctly (size: {result.file_size_mb} MB)")


def test_service_initialization():
    """Test RemotionRendererService initialization"""
    print("\n✓ Test 4: Service Initialization")
    try:
        service = RemotionRendererService()
        assert service.remotion_dir.exists(), f"Remotion dir doesn't exist: {service.remotion_dir}"
        print(f"  - Service initialized (dir: {service.remotion_dir})")
    except FileNotFoundError as e:
        print(f"  ⚠ Warning: {e}")
        print("  - This is expected if remotion-render hasn't been set up yet")


def test_config_validation_errors():
    """Test configuration validation error handling"""
    print("\n✓ Test 5: Configuration Validation")
    service = RemotionRendererService()
    
    # Test: Empty scenes
    try:
        config = RenderConfig(
            scenes=[],
            audio_path='/tmp/audio.mp3',
            output_path='/tmp/output.mp4',
        )
        service._validate_config(config)
        assert False, "Should have raised ValueError"
    except ValueError as e:
        print(f"  - Correctly rejected empty scenes: {e}")
    
    # Test: Missing audio
    try:
        config = RenderConfig(
            scenes=[Scene(image_path='/tmp/img.jpg', duration_frames=90)],
            audio_path='',
            output_path='/tmp/output.mp4',
        )
        service._validate_config(config)
        assert False, "Should have raised ValueError"
    except ValueError as e:
        print(f"  - Correctly rejected missing audio: {e}")


def test_temp_config_file_creation():
    """Test temporary config file creation and cleanup"""
    print("\n✓ Test 6: Temp Config File Creation")
    service = RemotionRendererService()
    
    config = RenderConfig(
        scenes=[Scene(image_path='/tmp/img.jpg', duration_frames=90)],
        audio_path='/tmp/audio.mp3',
        output_path='/tmp/output.mp4',
    )
    
    config_path = service._create_temp_config(config)
    
    # Verify file exists and is valid JSON
    assert config_path.exists(), f"Config file not created: {config_path}"
    with open(config_path, 'r') as f:
        config_dict = json.load(f)
    
    assert 'scenes' in config_dict
    assert len(config_dict['scenes']) == 1
    
    # Clean up
    config_path.unlink()
    assert not config_path.exists(), "Config file not deleted"
    
    print(f"  - Temp config created, validated, and cleaned up")


def main():
    print("\n" + "=" * 60)
    print("🧪 Remotion Renderer Service Unit Tests")
    print("=" * 60)
    
    try:
        test_scene_creation()
        test_render_config_creation()
        test_render_result_creation()
        test_service_initialization()
        test_config_validation_errors()
        test_temp_config_file_creation()
        
        print("\n" + "=" * 60)
        print("✅ All unit tests passed!")
        print("=" * 60 + "\n")
        return 0
        
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}\n")
        return 1
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}\n")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
