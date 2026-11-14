plugins {
    id("com.android.application")
}

android {
    namespace = "vn.routevn.androidplayer"
    compileSdk = 37
    buildToolsVersion = "37.0.0"
    ndkVersion = "29.0.14206865"

    defaultConfig {
        applicationId = "vn.routevn.androidplayer.template"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            // Keep the committed template reproducible on any build machine.
            vcsInfo.include = false
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    packaging {
        jniLibs.useLegacyPackaging = false
    }

    androidResources {
        // The exporter adds the game package, and the player opens it in
        // place with openFd. The APKs Google Play builds from an exported
        // bundle must keep it uncompressed.
        noCompress += "routevn-package.bin"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.17.0")
    implementation("androidx.core:core-splashscreen:1.2.0")
}
