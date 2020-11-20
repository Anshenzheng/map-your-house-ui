import React, {useState} from "react";
import styled from "styled-components";
import MaleImg from "../../assets/img/male.png";

import { Pannellum, PannellumVideo } from "pannellum-react";
import myBedRoomImage from "@assets/img/alma.ce3e3084-bedroom.jpg";
import {Link} from "react-router-dom";
/**
 * 室内全景
 */

interface HotSpot{
    id: number
    text: string,
    pitch: number,
    yaw: number,
    hfov: number,
    pannellumImg:PannellumImg
}

interface PannellumImg {
    imgUrl: string,
    hotSports: HotSpot[]
}

const PannellumReact = (props) => {
    const [pannellumImg, setPannellumImg] = useState(props.pannellumImg);
    console.log(pannellumImg);
    return (
    <Container id="components-anchor-roompanellum-info_2">
        <div className="nav-container">
            <h2 className="title">室内全景</h2>
            <Pannellum
                width="100%"
                height="500px"
                image={pannellumImg.imgUrl}
                pitch={10}
                yaw={180}
                hfov={110}
                autoLoad
                onLoad={() => {
                    console.log("panorama loaded");
                }}
            >
                {
                    pannellumImg.hotSports?.map(item=>
                        <Pannellum.Hotspot  key={item.id}
                            type="custom"
                            pitch={item.pitch}
                            yaw={item.yaw}
                            hfov={item.hfov}
                            text={item.text}
                            handleClick={ (evt , args) => {
                                setPannellumImg(args);
                            }
                            }
                            handleClickArg={item.pannellumImg}
                        />
                    )

                }
            </Pannellum>
        </div>
    </Container>
    )
};

const Container = styled.div`
.room-mate-container{
     display: flex;
     flex-wrap: wrap;
     .mate-block{
        background: rgba(0,0,0,.03);
        border-radius: 4px;
        margin-bottom: 20px;
        margin-right: 20px;
        padding: 22px 0;
        width: 330px;
        display: flex;
        .head-img{
            border-radius: 100px;
            height: 60px;
            margin-left: 20px;
            margin-right: 14px;
            overflow: hidden;
            width: 60px;
        }
        .info{
            font-size: 17px;
            width: 236px;
            color: rgba(0,0,0,.85);
            letter-spacing: 0;
            .room{
                color: rgba(0,0,0,.85);
                letter-spacing: 0;
                .time{
                    color: rgba(0,0,0,.4);
                    font-size: 17px;
                    letter-spacing: 0;
                    line-height: 20px;
                    margin-left: 9px;
                }
            }
            .person{
                margin-top: 10px;
                .slash{
                    display: inline-block;
                    height: 18px;
                    margin: 0 6px;
                    position: relative;
                    top: 3px;
                    &:after{
                        border-right: 1px solid rgba(0,0,0,.4);
                        bottom: 0;
                        box-sizing: border-box;
                        color: #000;
                        color: rgba(0,0,0,.4);
                        content: " ";
                        height: 200%;
                        position: absolute;
                        right: 0;
                        top: 0;
                        transform: scale(.5);
                        transform-origin: 0 0;
                        width: 1px
                    }
                }
            }
        }
    }
`;
export default PannellumReact;
